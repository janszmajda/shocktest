"""Test Polymarket Gamma API — verify markets + price history endpoints."""

import json

import requests

GAMMA_BASE = "https://gamma-api.polymarket.com"
CLOB_BASE = "https://clob.polymarket.com"


def test_markets() -> list[dict]:
    """Fetch 10 active markets and print their key fields."""
    print("=== Fetching markets from Polymarket Gamma API ===")
    resp = requests.get(
        f"{GAMMA_BASE}/markets",
        params={"active": "true", "closed": "false", "limit": 10},
        timeout=15,
    )
    resp.raise_for_status()
    markets = resp.json()
    print(f"Got {len(markets)} markets\n")

    for m in markets:
        print(f"Question: {m.get('question', 'N/A')}")
        # clobTokenIds might be a JSON string — parse it
        raw_tokens = m.get("clobTokenIds", "[]")
        if isinstance(raw_tokens, str):
            tokens = json.loads(raw_tokens)
        else:
            tokens = raw_tokens
        print(f"  token_ids: {tokens}")
        print(f"  outcomePrices: {m.get('outcomePrices', 'N/A')}")
        print(f"  volume: {m.get('volume', 'N/A')}")
        print(f"  slug: {m.get('slug', 'N/A')}")
        print("---")

    print(f"\nAll fields on first market: {list(markets[0].keys())}")
    return markets


def test_price_history(token_id: str) -> list[dict]:
    """Fetch price history for a single token and print data shape."""
    print(f"\n=== Fetching price history for token: {token_id} ===")
    resp = requests.get(
        f"{CLOB_BASE}/prices-history",
        params={"market": token_id, "interval": "all", "fidelity": 1},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    history = data.get("history", [])

    print(f"Got {len(history)} data points")
    if len(history) > 0:
        print(f"Sample point: {history[0]}")
        print(f"Fields available: {list(history[0].keys())}")
        # Check time resolution
        if len(history) >= 2:
            t0 = history[0].get("t", 0)
            t1 = history[1].get("t", 0)
            try:
                interval = float(t1) - float(t0)
                print(f"Interval between first two points: {interval}s ({interval / 60:.1f} min)")
            except (TypeError, ValueError):
                print(f"Timestamps: {t0}, {t1} (could not compute interval)")
        # Check price range
        prices = []
        for pt in history:
            p = pt.get("p", pt.get("price", None))
            if p is not None:
                prices.append(float(p))
        if prices:
            print(f"Price range: {min(prices):.4f} to {max(prices):.4f}")
    return history


def main() -> None:
    """Run market fetch + price history test."""
    markets = test_markets()
    if not markets:
        print("No markets returned — check API.")
        return

    # Extract first token_id
    raw_tokens = markets[0].get("clobTokenIds", "[]")
    if isinstance(raw_tokens, str):
        tokens = json.loads(raw_tokens)
    else:
        tokens = raw_tokens

    if tokens:
        test_price_history(tokens[0])
    else:
        print("No token IDs found on first market — check field names.")


if __name__ == "__main__":
    main()
