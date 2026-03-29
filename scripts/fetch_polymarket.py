"""Bulk fetch Polymarket markets + price history → MongoDB market_series."""

import json
import os
import sys
import time

import requests
from pymongo import MongoClient

# Fix Windows console encoding for unicode market titles
sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

MONGO_URI = os.environ.get("MONGODB_URI", "")
GAMMA_BASE = "https://gamma-api.polymarket.com"
CLOB_BASE = "https://clob.polymarket.com"

if not MONGO_URI:
    print("ERROR: MONGODB_URI environment variable not set.")
    sys.exit(1)

client: MongoClient = MongoClient(MONGO_URI)
db = client["shocktest"]


def parse_token_ids(market: dict) -> list[str]:
    """Parse clobTokenIds, handling both JSON string and list formats."""
    raw = market.get("clobTokenIds", "[]")
    if isinstance(raw, str):
        return json.loads(raw)
    return raw


def fetch_polymarket_markets(limit: int = 100, offset: int = 0) -> list[dict]:
    """Fetch active binary markets from Polymarket, sorted by volume."""
    resp = requests.get(
        f"{GAMMA_BASE}/markets",
        params={
            "active": "true",
            "closed": "false",
            "limit": limit,
            "offset": offset,
            "order": "volume24hr",
            "ascending": "false",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_price_history(token_id: str) -> list[dict]:
    """Fetch full price history from CLOB API, return list of {t, p} dicts."""
    try:
        resp = requests.get(
            f"{CLOB_BASE}/prices-history",
            params={"market": token_id, "interval": "all", "fidelity": 1},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        history = data.get("history", [])
    except requests.RequestException as e:
        print(f"  Failed to fetch history: {e}")
        return []

    series = []
    for pt in history:
        t = pt.get("t")
        p = pt.get("p")
        if t is not None and p is not None:
            series.append({"t": float(t), "p": float(p)})

    return series


def store_market(market: dict, series: list[dict]) -> int:
    """Store one market + price history in MongoDB. Returns point count."""
    tokens = parse_token_ids(market)
    token_id = tokens[0] if tokens else ""

    # Parse close/end date — Polymarket provides endDateIso or end_date_iso
    end_date_raw = market.get("endDateIso") or market.get("end_date_iso")
    close_time: float | None = None
    if end_date_raw:
        from datetime import datetime, timezone

        try:
            dt = datetime.fromisoformat(end_date_raw.replace("Z", "+00:00"))
            close_time = dt.timestamp()
        except (ValueError, TypeError):
            pass

    doc = {
        "market_id": market.get("id", market.get("slug", token_id)),
        "source": "polymarket",
        "question": market["question"],
        "token_id": token_id,
        "volume": float(market.get("volume", 0)),
        "series": sorted(series, key=lambda x: x["t"]),
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
    """Fetch Polymarket markets with price history into MongoDB."""
    # Fetch markets across all available pages
    all_markets: list[dict] = []
    for offset in range(0, 1000, 100):
        batch = fetch_polymarket_markets(limit=100, offset=offset)
        if not batch:
            break
        all_markets.extend(batch)
        print(f"Fetched page offset={offset}: {len(batch)} markets")
        if len(batch) < 100:
            break

    # Filter to binary markets with token IDs and reasonable volume
    binary_markets = []
    for m in all_markets:
        tokens = parse_token_ids(m)
        if len(tokens) == 2 and float(m.get("volume", 0)) > 1000:
            binary_markets.append(m)

    # Deduplicate by market id
    seen: set[str] = set()
    unique_markets: list[dict] = []
    for m in binary_markets:
        mid = m.get("id", m.get("slug", ""))
        if mid not in seen:
            seen.add(mid)
            unique_markets.append(m)

    print(f"\nFound {len(unique_markets)} unique binary markets with volume > $1000")

    stored = 0
    skipped = 0
    for i, market in enumerate(unique_markets):
        question = market["question"][:70]
        tokens = parse_token_ids(market)
        token_id = tokens[0]

        print(f"[{i + 1}/{len(unique_markets)}] {question}...")

        series = fetch_price_history(token_id)
        if len(series) < 10:
            print(f"  Skipping — only {len(series)} data points")
            skipped += 1
            continue

        n_points = store_market(market, series)
        print(f"  Stored {n_points} price points")
        stored += 1

        time.sleep(0.5)  # be polite to the API

    # Summary
    total_in_db = db["market_series"].count_documents({"source": "polymarket"})
    print(f"\n=== Done: stored {stored}, skipped {skipped} ===")
    print(f"=== Total Polymarket markets in MongoDB: {total_in_db} ===")


if __name__ == "__main__":
    main()
