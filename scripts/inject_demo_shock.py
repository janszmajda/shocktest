"""
Inject a fake shock into MongoDB for demo purposes.
The dashboard will pick it up on its next poll (or on refresh).

Usage:
    python scripts/inject_demo_shock.py

The shock will appear as a live alert on the dashboard and
trigger a Chrome extension notification.
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timezone
from pymongo import MongoClient

# Load .env files — check dashboard/.env.local, .env.local, .env
for env_path in [
    Path(__file__).resolve().parent.parent / "dashboard" / ".env.local",
    Path(__file__).resolve().parent.parent / ".env.local",
    Path(__file__).resolve().parent.parent / ".env",
]:
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

MONGODB_URI = os.environ.get("MONGODB_URI")
if not MONGODB_URI:
    print("Error: MONGODB_URI not set (checked env vars + .env files)")
    sys.exit(1)

# ── Configure your demo shock here ──

DEMO_SHOCKS = [
    {
        "question": "Will the US announce new tariffs on EU goods by April 2026?",
        "category": "politics",
        "p_before": 0.35,
        "p_after": 0.58,
        "source": "polymarket",
        "market_id": "demo-tariffs-eu-april-2026",
    },
    {
        "question": "Will Bitcoin exceed $120k by end of Q2 2026?",
        "category": "crypto",
        "p_before": 0.22,
        "p_after": 0.41,
        "source": "polymarket",
        "market_id": "demo-btc-120k-q2-2026",
    },
    {
        "question": "Will there be a ceasefire in Ukraine by May 2026?",
        "category": "geopolitics",
        "p_before": 0.48,
        "p_after": 0.31,
        "source": "polymarket",
        "market_id": "demo-ukraine-ceasefire-may-2026",
    },
    {
        "question": "Will the Fed cut interest rates in April 2026?",
        "category": "finance",
        "p_before": 0.15,
        "p_after": 0.38,
        "source": "polymarket",
        "market_id": "demo-fed-rate-cut-april-2026",
    },
    {
        "question": "Will Tesla stock close above $300 by end of April 2026?",
        "category": "finance",
        "p_before": 0.55,
        "p_after": 0.32,
        "source": "polymarket",
        "market_id": "demo-tesla-300-april-2026",
    },
    {
        "question": "Will Trump sign a new executive order on AI regulation by April 2026?",
        "category": "politics",
        "p_before": 0.40,
        "p_after": 0.67,
        "source": "polymarket",
        "market_id": "demo-trump-ai-exec-order-2026",
    },
    {
        "question": "Will Ethereum flip Bitcoin in market cap by June 2026?",
        "category": "crypto",
        "p_before": 0.08,
        "p_after": 0.22,
        "source": "polymarket",
        "market_id": "demo-eth-flip-btc-june-2026",
    },
    {
        "question": "Will a Category 5 hurricane hit the US mainland before July 2026?",
        "category": "science",
        "p_before": 0.12,
        "p_after": 0.29,
        "source": "polymarket",
        "market_id": "demo-cat5-hurricane-july-2026",
    },
    {
        "question": "Will China announce military exercises near Taiwan in April 2026?",
        "category": "geopolitics",
        "p_before": 0.30,
        "p_after": 0.55,
        "source": "polymarket",
        "market_id": "demo-china-taiwan-exercises-2026",
    },
    {
        "question": "Will the Lakers win the 2026 NBA Championship?",
        "category": "sports",
        "p_before": 0.18,
        "p_after": 0.35,
        "source": "polymarket",
        "market_id": "demo-lakers-nba-champ-2026",
    },
]


def generate_price_series(p_before: float, p_after: float, now: datetime) -> list[dict]:
    """
    Generate a realistic-looking 7-day price series with a visible shock spike.

    The series has:
    - 7 days of gentle random walk leading up to the shock
    - A sharp move from p_before to p_after in the last ~5 minutes
    - A partial reversion over the last few minutes (looks live)
    """
    import random
    random.seed(hash(now.isoformat()))  # reproducible per injection time

    series = []
    points_per_hour = 4  # one point every 15 min
    total_hours = 7 * 24  # 7 days
    total_points = total_hours * points_per_hour

    # Start time: 7 days ago
    start_t = now.timestamp() - (total_hours * 3600)

    # Random walk parameters
    volatility = 0.003  # per-step volatility
    price = p_before + random.uniform(-0.05, 0.05)  # start near p_before with some offset
    price = max(0.02, min(0.98, price))

    # Generate the pre-shock random walk
    shock_point = total_points - 3  # shock happens 3 points before the end (~45 min ago)

    for i in range(total_points):
        t = start_t + (i * 3600 / points_per_hour)

        if i < shock_point - 10:
            # Normal random walk, gradually drifting toward p_before
            drift = (p_before - price) * 0.002  # gentle mean-reversion to p_before
            price += drift + random.gauss(0, volatility)
        elif i < shock_point:
            # Last ~2.5 hours before shock: settle near p_before
            drift = (p_before - price) * 0.02
            price += drift + random.gauss(0, volatility * 0.5)
        elif i == shock_point:
            # THE SHOCK — sharp jump to p_after
            price = p_after
        elif i == shock_point + 1:
            # Slight continuation
            overshoot = (p_after - p_before) * random.uniform(0.05, 0.15)
            price = p_after + overshoot
        else:
            # Partial reversion (looks like it's starting to come back)
            revert = (p_before - price) * random.uniform(0.1, 0.25)
            price += revert + random.gauss(0, volatility * 0.3)

        price = max(0.01, min(0.99, price))
        series.append({"t": round(t), "p": round(price, 4)})

    return series


def inject_shock(shock_config: dict) -> str:
    """Insert a demo shock + realistic price series into MongoDB."""
    now = datetime.now(timezone.utc)
    t1 = datetime(now.year, now.month, now.day, now.hour, now.minute - 5 if now.minute >= 5 else 0, tzinfo=timezone.utc)
    t2 = now

    delta = shock_config["p_after"] - shock_config["p_before"]

    # Generate realistic price series
    series = generate_price_series(shock_config["p_before"], shock_config["p_after"], now)

    shock_doc = {
        "market_id": shock_config["market_id"],
        "source": shock_config["source"],
        "question": shock_config["question"],
        "category": shock_config["category"],
        "t1": t1.isoformat(),
        "t2": t2.isoformat(),
        "p_before": shock_config["p_before"],
        "p_after": shock_config["p_after"],
        "delta": delta,
        "abs_delta": abs(delta),
        "post_move_1h": None,
        "post_move_6h": None,
        "post_move_24h": None,
        "reversion_1h": None,
        "reversion_6h": None,
        "reversion_24h": None,
        "is_recent": True,
        "is_live_alert": True,
        "hours_ago": 0,
        "detected_at": now.isoformat(),
        "fade_pnl_1h": None,
        "fade_pnl_6h": None,
        "fade_pnl_24h": None,
        "historical_win_rate": 0.60,
        "historical_avg_pnl": 0.035,
        "historical_sample_size": 45,
        "ai_analysis": None,
    }

    market_doc = {
        "market_id": shock_config["market_id"],
        "source": shock_config["source"],
        "question": shock_config["question"],
        "token_id": shock_config["market_id"],
        "volume": 50000,
        "category": shock_config["category"],
        "series": series,
    }

    client = MongoClient(MONGODB_URI)
    db = client["shocktest"]
    result = db["shock_events"].insert_one(shock_doc)
    db["market_series"].update_one(
        {"market_id": shock_config["market_id"]},
        {"$set": market_doc},
        upsert=True,
    )
    client.close()
    return str(result.inserted_id)


def main():
    print("Which shock to inject?\n")
    for i, s in enumerate(DEMO_SHOCKS):
        delta = s["p_after"] - s["p_before"]
        sign = "+" if delta > 0 else ""
        print(f"  [{i + 1}] {s['question'][:60]}")
        print(f"      {s['p_before']*100:.0f}% → {s['p_after']*100:.0f}% ({sign}{delta*100:.0f}pp) · {s['category']}\n")
    print(f"  [a] All of them\n")

    choice = input("Enter choice: ").strip().lower()

    if choice == "a":
        for s in DEMO_SHOCKS:
            shock_id = inject_shock(s)
            print(f"  ✓ Injected: {s['question'][:50]}... → {shock_id}")
    elif choice.isdigit() and 1 <= int(choice) <= len(DEMO_SHOCKS):
        s = DEMO_SHOCKS[int(choice) - 1]
        shock_id = inject_shock(s)
        print(f"  ✓ Injected: {s['question'][:50]}... → {shock_id}")
    else:
        print("Invalid choice.")
        sys.exit(1)

    print("\nDone. Refresh the dashboard or wait for the next poll cycle.")


if __name__ == "__main__":
    main()
