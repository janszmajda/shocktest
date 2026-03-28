"""Live shock monitor for ShockTest.

Runs in a loop: fetches latest Polymarket prices, detects new shocks,
writes alerts to MongoDB with historical edge context.

Run with: python scripts/live_monitor.py
Keep it running in a terminal during the demo.
"""

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import requests
from pymongo import MongoClient

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

MONGO_URI = os.environ.get("MONGODB_URI", "")
if not MONGO_URI:
    print("ERROR: MONGODB_URI not set.")
    sys.exit(1)

db = MongoClient(MONGO_URI)["shocktest"]

MIN_SIMILAR_SAMPLE = 5


def query_similar_stats(
    category: str, abs_delta: float, direction: str
) -> dict:
    """Query shock_events for similar historical shocks and compute stats.

    Tries tight filter (category + magnitude ±30% + direction), falls back
    to category-only, then all shocks if sample is too small.

    Returns dict with win_rate, avg_pnl, sample_size, filter_level.
    """
    import numpy as np

    tight_filter: dict = {
        "abs_delta": {"$gte": abs_delta * 0.7, "$lte": abs_delta * 1.3},
        "category": category,
    }
    if direction == "up":
        tight_filter["delta"] = {"$gt": 0}
    else:
        tight_filter["delta"] = {"$lt": 0}

    shocks = list(db["shock_events"].find(tight_filter, {"reversion_6h": 1}))
    filter_level = "tight"

    if len(shocks) < MIN_SIMILAR_SAMPLE:
        shocks = list(db["shock_events"].find({"category": category}, {"reversion_6h": 1}))
        filter_level = "category"

    if len(shocks) < MIN_SIMILAR_SAMPLE:
        shocks = list(db["shock_events"].find({}, {"reversion_6h": 1}))
        filter_level = "all"

    vals = [s["reversion_6h"] for s in shocks if s.get("reversion_6h") is not None]
    if not vals:
        return {"win_rate": None, "avg_pnl": None, "sample_size": 0, "filter_level": filter_level}

    arr = np.array(vals)
    return {
        "win_rate": round(float(np.mean(arr > 0)), 4),
        "avg_pnl": round(float(arr.mean()), 4),
        "sample_size": len(vals),
        "filter_level": filter_level,
    }

CLOB_BASE = "https://clob.polymarket.com"
THETA = 0.08  # shock threshold
POLL_INTERVAL = 120  # seconds between checks
LOOKBACK_POINTS = 30  # recent price points to scan for shocks
MAX_WORKERS = 10  # concurrent API requests


def _fetch_one_market(token_id: str) -> list[dict]:
    """Fetch recent price history for a single token. Returns list of {t, p}."""
    try:
        resp = requests.get(
            f"{CLOB_BASE}/prices-history",
            params={"market": token_id, "interval": "1h", "fidelity": 1},
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        history = data.get("history", [])
        if not history:
            return []
        points = []
        for pt in history[-LOOKBACK_POINTS:]:
            t = pt.get("t")
            p = pt.get("p")
            if t is not None and p is not None:
                points.append({"t": float(t), "p": float(p)})
        return points
    except Exception:
        return []


def fetch_latest_prices() -> int:
    """Fetch latest prices for high-value Polymarket markets concurrently.

    Polls markets with volume > 10000 OR that have existing shocks.
    Uses ThreadPoolExecutor for concurrent requests.
    """
    # Get market IDs that already have shocks
    shock_market_ids = set(db["shock_events"].distinct("market_id"))

    # Get high-volume markets + markets with shocks
    all_poly = list(
        db["market_series"].find(
            {"source": "polymarket"},
            {"market_id": 1, "token_id": 1, "volume": 1},
        )
    )
    markets_to_poll = [
        m
        for m in all_poly
        if m.get("token_id") and (float(m.get("volume", 0)) > 10000 or m["market_id"] in shock_market_ids)
    ]

    updated = 0
    # Concurrent fetch
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_market = {executor.submit(_fetch_one_market, m["token_id"]): m for m in markets_to_poll}
        for future in as_completed(future_to_market):
            market = future_to_market[future]
            new_points = future.result()
            if new_points:
                db["market_series"].update_one(
                    {"_id": market["_id"]},
                    {"$addToSet": {"series": {"$each": new_points}}},
                )
                updated += 1

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

        # New live shock — build alert with similar-shock edge context
        category = market.get("category") or "other"
        direction = "up" if delta > 0 else "down"
        similar = query_similar_stats(category, abs(delta), direction)

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
            # Historical edge context from similar shocks
            "historical_win_rate": similar["win_rate"],
            "historical_avg_pnl": similar["avg_pnl"],
            "historical_sample_size": similar["sample_size"],
            "historical_filter_level": similar["filter_level"],
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
        n = alert["historical_sample_size"]
        lvl = alert["historical_filter_level"]
        if win_rate and avg_pnl:
            print(f"Similar shocks ({lvl}, n={n}): {win_rate:.0%} win rate, avg P&L ${avg_pnl:.4f}/$1")
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
    print(f"Polling every {POLL_INTERVAL}s | Threshold: {THETA} | Workers: {MAX_WORKERS}")
    print("Using similar-shock matching for historical edge context")
    print("Ctrl+C to stop\n")

    while True:
        try:
            cycle_start = time.time()
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] Fetching prices...", end=" ", flush=True)
            n = fetch_latest_prices()
            print(f"{n} updated.", end=" ", flush=True)

            print("Scanning...", end=" ", flush=True)
            new = detect_live_shocks()
            if new:
                print(f"NEW SHOCKS: {len(new)}!", end=" ", flush=True)
            else:
                print("no new shocks.", end=" ", flush=True)

            update_hours_ago()
            elapsed = time.time() - cycle_start
            print(f"[{elapsed:.1f}s]")

            time.sleep(max(0, POLL_INTERVAL - elapsed))
        except KeyboardInterrupt:
            print("\nStopping monitor.")
            break
        except Exception as e:
            print(f"\nError: {e}")
            time.sleep(30)


if __name__ == "__main__":
    main()
