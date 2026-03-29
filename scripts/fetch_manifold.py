"""Fetch supplemental Manifold markets + bet history → MongoDB market_series."""

import os
import sys
import time

import requests
from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGODB_URI", "")

if not MONGO_URI:
    print("ERROR: MONGODB_URI environment variable not set.")
    sys.exit(1)

client: MongoClient = MongoClient(MONGO_URI)
db = client["shocktest"]

MANIFOLD_BASE = "https://api.manifold.markets/v0"


def fetch_manifold_markets(limit: int = 50) -> list[dict]:
    """Fetch active binary markets from Manifold, sorted by activity."""
    resp = requests.get(
        f"{MANIFOLD_BASE}/markets",
        params={"limit": limit, "sort": "last-bet-time", "order": "desc"},
        timeout=15,
    )
    resp.raise_for_status()
    markets = resp.json()

    # Filter: binary, not resolved
    binary = [m for m in markets if m.get("outcomeType") == "BINARY" and not m.get("isResolved")]
    print(f"Found {len(binary)} active binary Manifold markets")
    return binary


def fetch_manifold_bets(contract_id: str, limit: int = 5000) -> list[dict]:
    """Fetch bet history for a Manifold market — this IS the price history."""
    try:
        resp = requests.get(
            f"{MANIFOLD_BASE}/bets",
            params={"contractId": contract_id, "limit": limit},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        print(f"  Failed to fetch bets: {e}")
        return []


def store_manifold_market(market: dict, bets: list[dict]) -> int:
    """Convert Manifold bets to time series and store in MongoDB."""
    # Build series from bets — Manifold timestamps are in MILLISECONDS
    series: list[dict] = []
    for bet in bets:
        created = bet.get("createdTime")
        prob = bet.get("probAfter")
        if created is not None and prob is not None:
            series.append({"t": float(created) / 1000.0, "p": float(prob)})

    series.sort(key=lambda x: x["t"])

    # Deduplicate: keep last bet per 2-minute window to reduce noise
    if len(series) > 500:
        deduped: list[dict] = []
        last_t = 0.0
        for pt in series:
            if pt["t"] - last_t >= 120:  # 2 min gap
                deduped.append(pt)
                last_t = pt["t"]
        # Always keep the last point
        if series and (not deduped or deduped[-1]["t"] != series[-1]["t"]):
            deduped.append(series[-1])
        series = deduped

    # Manifold closeTime is in milliseconds
    close_time_raw = market.get("closeTime")
    close_time: float | None = None
    if close_time_raw is not None:
        close_time = float(close_time_raw) / 1000.0

    doc = {
        "market_id": f"manifold_{market['id']}",
        "source": "manifold",
        "question": market["question"],
        "token_id": market["id"],
        "volume": float(market.get("volume", 0)),
        "series": series,
        "category": None,
        "close_time": close_time,
    }

    db["market_series"].update_one(
        {"market_id": doc["market_id"]},
        {"$set": doc},
        upsert=True,
    )
    return len(doc["series"])


def main() -> None:
    """Fetch Manifold markets with bet history into MongoDB."""
    markets = fetch_manifold_markets(limit=200)

    stored = 0
    skipped = 0
    for i, market in enumerate(markets):
        question = market.get("question", "N/A")[:70]
        print(f"[{i + 1}/{len(markets)}] {question}...")

        bets = fetch_manifold_bets(market["id"])
        if len(bets) < 20:
            print(f"  Skipping — only {len(bets)} bets")
            skipped += 1
            continue

        n_points = store_manifold_market(market, bets)
        print(f"  Stored {n_points} price points")
        stored += 1

        # Stop once we have enough
        if stored >= 60:
            print("  Reached 60 stored markets — stopping.")
            break

        time.sleep(0.3)

    # Summary
    total = db["market_series"].count_documents({})
    poly = db["market_series"].count_documents({"source": "polymarket"})
    mani = db["market_series"].count_documents({"source": "manifold"})
    print(f"\n=== Done: stored {stored}, skipped {skipped} ===")
    print(f"=== MongoDB totals: {total} markets ({poly} Polymarket, {mani} Manifold) ===")


if __name__ == "__main__":
    main()
