"""Live shock monitor for ShockTest.

Runs in a loop: fetches latest Polymarket prices, detects new shocks,
writes alerts to MongoDB with historical edge context.

Run with: python scripts/live_monitor.py
Keep it running in a terminal during the demo.
"""

import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests
from pymongo import MongoClient

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

MONGO_URI = os.environ.get("MONGODB_URI", "")
if not MONGO_URI:
    print("ERROR: MONGODB_URI not set.")
    sys.exit(1)

db = MongoClient(MONGO_URI)["shocktest"]

# Load backtest stats for historical edge context
aggregate = db["shock_results"].find_one({"_id": "aggregate_stats"})
backtest: dict = aggregate.get("backtest", {}) if aggregate else {}
by_category: dict = backtest.get("by_category", {})

CLOB_BASE = "https://clob.polymarket.com"
THETA = 0.08  # shock threshold
POLL_INTERVAL = 120  # seconds between checks
LOOKBACK_POINTS = 30  # recent price points to scan for shocks


def fetch_latest_prices() -> int:
    """Fetch latest prices for all tracked Polymarket markets via CLOB API."""
    markets = list(
        db["market_series"].find(
            {"source": "polymarket"},
            {"market_id": 1, "token_id": 1, "question": 1, "category": 1},
        )
    )

    updated = 0
    for market in markets:
        try:
            token_id = market.get("token_id")
            if not token_id:
                continue

            resp = requests.get(
                f"{CLOB_BASE}/prices-history",
                params={"market": token_id, "interval": "1h", "fidelity": 1},
                timeout=10,
            )
            if resp.status_code != 200:
                continue

            data = resp.json()
            history = data.get("history", [])
            if not history:
                continue

            # Take last LOOKBACK_POINTS points
            recent_points = history[-LOOKBACK_POINTS:]
            new_points = []
            for point in recent_points:
                t = point.get("t")
                p = point.get("p")
                if t is not None and p is not None:
                    new_points.append({"t": float(t), "p": float(p)})

            if new_points:
                # Add new points to the series (MongoDB deduplicates via $addToSet)
                db["market_series"].update_one(
                    {"_id": market["_id"]},
                    {"$addToSet": {"series": {"$each": new_points}}},
                )
                updated += 1

            time.sleep(0.3)  # rate limit
        except Exception:
            continue

    return updated


def detect_live_shocks() -> list[dict]:
    """Run shock detection on recent data, write new alerts to MongoDB."""
    now = datetime.now(timezone.utc)
    markets = list(db["market_series"].find({"source": "polymarket"}))

    new_shocks: list[dict] = []

    for market in markets:
        series = market.get("series", [])
        if len(series) < 10:
            continue

        series = sorted(series, key=lambda x: x["t"])
        recent = series[-LOOKBACK_POINTS:]

        if len(recent) < 2:
            continue

        p_first = float(recent[0]["p"])
        p_last = float(recent[-1]["p"])
        delta = p_last - p_first

        if abs(delta) < THETA:
            continue

        # Skip prices near 0 or 1 (likely resolved markets)
        if not (0.05 <= p_last <= 0.95 and 0.05 <= p_first <= 0.95):
            continue

        # Dedup: skip if we already logged this market's shock in the last 2 hours
        existing = db["shock_events"].find_one(
            {
                "market_id": market["market_id"],
                "is_live_alert": True,
                "detected_at": {"$gte": (now - timedelta(hours=2)).isoformat()},
            }
        )
        if existing:
            continue

        # New live shock — build alert with historical edge context
        category = market.get("category") or "other"
        cat_stats = by_category.get(category, {})

        t1_val = recent[0]["t"]
        t2_val = recent[-1]["t"]
        t1_iso = (
            datetime.fromtimestamp(t1_val, tz=timezone.utc).isoformat()
            if isinstance(t1_val, (int, float))
            else str(t1_val)
        )
        t2_iso = (
            datetime.fromtimestamp(t2_val, tz=timezone.utc).isoformat()
            if isinstance(t2_val, (int, float))
            else str(t2_val)
        )

        alert = {
            "market_id": market["market_id"],
            "source": market.get("source", "polymarket"),
            "question": market.get("question", ""),
            "category": category,
            "t1": t1_iso,
            "t2": t2_iso,
            "p_before": round(p_first, 4),
            "p_after": round(p_last, 4),
            "delta": round(delta, 4),
            "abs_delta": round(abs(delta), 4),
            # Historical edge context for the frontend
            "historical_win_rate": cat_stats.get("win_rate_6h", backtest.get("win_rate_6h")),
            "historical_avg_pnl": cat_stats.get("avg_pnl_6h", backtest.get("avg_pnl_per_dollar_6h")),
            "historical_sample_size": cat_stats.get("sample_size", backtest.get("total_trades")),
            # Live alert metadata
            "is_recent": True,
            "is_live_alert": True,
            "hours_ago": 0,
            "detected_at": now.isoformat(),
            # Post-shock fields null (hasn't happened yet)
            "post_move_1h": None,
            "post_move_6h": None,
            "post_move_24h": None,
            "reversion_1h": None,
            "reversion_6h": None,
            "reversion_24h": None,
            "fade_pnl_1h": None,
            "fade_pnl_6h": None,
            "fade_pnl_24h": None,
        }

        db["shock_events"].insert_one(alert)
        new_shocks.append(alert)

        print(f"\n{'=' * 60}")
        print("LIVE SHOCK DETECTED")
        print(f"Market: {alert['question']}")
        print(f"Move: {alert['p_before']:.0%} -> {alert['p_after']:.0%} (delta={alert['delta']:+.0%})")
        print(f"Category: {category}")
        win_rate = alert["historical_win_rate"]
        avg_pnl = alert["historical_avg_pnl"]
        if win_rate and avg_pnl:
            print(f"Historical edge: {win_rate:.0%} win rate, avg P&L ${avg_pnl:.4f}/$1")
        print(f"Signal: FADE {'DOWN' if delta > 0 else 'UP'}")
        print(f"{'=' * 60}")

    return new_shocks


def update_hours_ago() -> None:
    """Keep hours_ago fresh for all recent shocks."""
    now = datetime.now(timezone.utc)
    recent = list(db["shock_events"].find({"is_recent": True}))
    for shock in recent:
        t2_str = shock.get("detected_at") or shock.get("t2")
        try:
            t2 = datetime.fromisoformat(t2_str.replace("Z", "+00:00"))
            hours_ago = (now - t2).total_seconds() / 3600
            db["shock_events"].update_one(
                {"_id": shock["_id"]},
                {"$set": {"hours_ago": round(hours_ago, 1), "is_recent": hours_ago <= 48}},
            )
        except Exception:
            continue


def main() -> None:
    """Run the live monitor loop."""
    print("ShockTest Live Monitor")
    print(f"Polling every {POLL_INTERVAL}s | Threshold: {THETA}")
    print(f"Backtest context: win_rate_6h={backtest.get('win_rate_6h', 'N/A')}")
    print("Ctrl+C to stop\n")

    while True:
        try:
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] Fetching prices...", end=" ", flush=True)
            n = fetch_latest_prices()
            print(f"{n} updated.", end=" ", flush=True)

            print("Scanning...", end=" ", flush=True)
            new = detect_live_shocks()
            if new:
                print(f"NEW SHOCKS: {len(new)}!")
            else:
                print("no new shocks.")

            update_hours_ago()
            time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            print("\nStopping monitor.")
            break
        except Exception as e:
            print(f"\nError: {e}")
            time.sleep(30)


if __name__ == "__main__":
    main()
