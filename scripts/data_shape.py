"""
Document the actual data shapes returned by Polymarket Gamma API.

Run test_polymarket.py first, then fill in the real field names here.
This file serves as a reference for Person 2 and Person 3.

MARKET OBJECT FIELDS (from GET /markets):
- id: str                     # unique market ID (use as market_id in MongoDB)
- question: str               # market title
- slug: str                   # URL-friendly name
- clobTokenIds: str (JSON)    # '["token1", "token2"]' — Yes/No token IDs (PARSE THIS)
- outcomePrices: str (JSON)   # '["0.65", "0.35"]' — current Yes/No prices
- volume: str                 # total volume traded (cast to float)
- liquidity: str              # current liquidity
- active: bool                # is market active
- closed: bool                # is market closed
- outcomes: str (JSON)        # '["Yes", "No"]'
- conditionId: str            # condition identifier

PRICE HISTORY ENDPOINT:
  GET https://clob.polymarket.com/prices-history?market={token_id}&interval=all&fidelity=1
  Response: { "history": [ { "t": int, "p": float }, ... ] }
  - fidelity=1 gives max resolution, fidelity=60 gives ~hourly
  - interval=all returns full history

PRICE HISTORY POINT FIELDS:
- t: int                      # unix timestamp in SECONDS
- p: float                    # price/probability 0-1

MARKET ENDPOINT:
  GET https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=N

NOTES:
- clobTokenIds is a JSON STRING, not a list — always json.loads() it
- outcomePrices is also a JSON STRING
- volume is a float (not string) in recent API responses
- Price history 't' is in seconds (not milliseconds)
- Manifold timestamps are in MILLISECONDS — normalize to seconds when fetching
- The gamma-api prices/history endpoint returns 404 — use clob.polymarket.com instead
"""

# ── Example: one market as it will be stored in MongoDB ──

SAMPLE_MARKET_DOC = {
    "market_id": "will-trump-win-2028",  # from market["id"] or market["slug"]
    "source": "polymarket",
    "question": "Will Trump win the 2028 presidential election?",
    "token_id": "12345678901234567890",  # first entry from clobTokenIds
    "volume": 1500000.0,  # float(market["volume"])
    "series": [  # from price history endpoint
        {"t": 1711000000.0, "p": 0.42},
        {"t": 1711000120.0, "p": 0.42},
        {"t": 1711000240.0, "p": 0.43},
        {"t": 1711000360.0, "p": 0.57},  # <-- shock happened here
        {"t": 1711000480.0, "p": 0.55},
    ],
    "category": None,  # Gemini fills this later
}

SAMPLE_PRICE_HISTORY = [
    {"t": 1711000000, "p": 0.42},
    {"t": 1711000120, "p": 0.42},
    {"t": 1711000240, "p": 0.43},
    {"t": 1711000360, "p": 0.57},
    {"t": 1711000480, "p": 0.55},
]
