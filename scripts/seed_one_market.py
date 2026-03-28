"""Seed one market + price history into MongoDB as proof of concept."""

import json
import os
import sys

import requests
from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGODB_URI", "")
GAMMA_BASE = "https://gamma-api.polymarket.com"
CLOB_BASE = "https://clob.polymarket.com"

if not MONGO_URI:
    print("ERROR: MONGODB_URI environment variable not set.")
    sys.exit(1)


def fetch_one_market() -> dict:
    """Fetch a single active market with high volume from Polymarket."""
    resp = requests.get(
        f"{GAMMA_BASE}/markets",
        params={"active": "true", "closed": "false", "limit": 5, "order": "volume", "ascending": "false"},
        timeout=15,
    )
    resp.raise_for_status()
    markets = resp.json()
    if not markets:
        print("No markets returned from API.")
        sys.exit(1)

    # Pick first market with token IDs
    for m in markets:
        raw_tokens = m.get("clobTokenIds", "[]")
        tokens = json.loads(raw_tokens) if isinstance(raw_tokens, str) else raw_tokens
        if tokens:
            return m

    print("No markets with clobTokenIds found.")
    sys.exit(1)


def fetch_price_history(token_id: str) -> list[dict]:
    """Fetch price history for a token, return list of {t, p} dicts."""
    resp = requests.get(
        f"{CLOB_BASE}/prices-history",
        params={"market": token_id, "interval": "all", "fidelity": 1},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    history = data.get("history", [])

    # Normalize to {t: float, p: float}
    series = []
    for pt in history:
        t = pt.get("t")
        p = pt.get("p", pt.get("price"))
        if t is not None and p is not None:
            series.append({"t": float(t), "p": float(p)})

    return series


def main() -> None:
    """Fetch one market, store it in MongoDB, verify."""
    market = fetch_one_market()

    raw_tokens = market.get("clobTokenIds", "[]")
    tokens = json.loads(raw_tokens) if isinstance(raw_tokens, str) else raw_tokens
    token_id = tokens[0]

    print(f"Fetching market: {market['question']}")
    print(f"  Token ID: {token_id}")

    series = fetch_price_history(token_id)
    print(f"  Price history points: {len(series)}")

    if not series:
        print("WARNING: No price history — market may be too new. Trying next market...")
        sys.exit(1)

    # Build document matching the market_series schema
    doc = {
        "market_id": market.get("id", market.get("slug", token_id)),
        "source": "polymarket",
        "question": market["question"],
        "token_id": token_id,
        "volume": float(market.get("volume", 0)),
        "series": series,
        "category": None,
    }

    # Store in MongoDB
    client: MongoClient = MongoClient(MONGO_URI)
    db = client["shocktest"]

    # Upsert to avoid duplicates on re-run
    db["market_series"].update_one({"market_id": doc["market_id"]}, {"$set": doc}, upsert=True)

    print(f"\nStored market: {doc['question']}")
    print(f"  Points: {len(doc['series'])}")
    if doc["series"]:
        print(f"  Time range: {doc['series'][0]['t']} to {doc['series'][-1]['t']}")

    # Verify
    stored = db["market_series"].find_one({"market_id": doc["market_id"]})
    if stored:
        print(f"  Verified in MongoDB: {stored['question']}")
    else:
        print("  ERROR: Document not found after insert!")


if __name__ == "__main__":
    main()
