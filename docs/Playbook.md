# ShockTest — Detailed Build Playbook
## Hour-by-Hour Instructions for Each Team Member
### YHack Spring 2026 · 24-Hour Build

---

> **How to use this document:** Each person follows their column independently. Steps marked with 🔗 are handoff points where you depend on or unblock someone else. Steps marked with ✅ have a "done" check — verify before moving on. Steps marked with ⚠️ have a fallback if something goes wrong.

---

## HOUR 0–2 · Setup, Data Verification & Prize Infra

### Person 1 (Data Pipeline)

**Minute 0–5 · GoDaddy Domain**
- Go to `mlh.link/godaddyregistry`
- Register `shocktest.xyz` (or `.dev`, `.tech` — pick what's available)
- Use code `YHack26` at checkout
- Save the domain name — share with team in group chat
- ✅ Done when: you have a confirmed domain registration

**Minute 5–20 · MongoDB Atlas Setup**
- Go to `mongodb.com/atlas`, create free account
- Create a new project called `shocktest`
- Deploy a free M0 cluster:
  - Provider: AWS
  - Region: `us-east-1`
  - Cluster name: `shocktest`
- Under Security → Database Access: create a user (e.g., `shocktest-admin` / generate a password). Save credentials.
- Under Security → Network Access: click "Add IP Address" → "Allow Access from Anywhere" (`0.0.0.0/0`). This is fine for a hackathon — restrict later.
- Go to Deployment → Database → Connect → Drivers → copy the connection string
- It will look like: `mongodb+srv://shocktest-admin:<password>@shocktest.xxxxx.mongodb.net/?retryWrites=true&w=majority`
- Replace `<password>` with your actual password
- 🔗 Share the connection string with Person 2 and Person 3 immediately
- ✅ Done when: you have a connection string and have shared it with the team

**Minute 20–30 · Test MongoDB Connection**
```bash
pip install pymongo
```
```python
# test_mongo.py
from pymongo import MongoClient

MONGO_URI = "mongodb+srv://shocktest-admin:<password>@shocktest.xxxxx.mongodb.net/?retryWrites=true&w=majority"
client = MongoClient(MONGO_URI)
db = client["shocktest"]

# Test write
db["test"].insert_one({"status": "connected"})
result = db["test"].find_one({"status": "connected"})
print(f"MongoDB connected: {result}")
db["test"].drop()
```
- ✅ Done when: script prints `MongoDB connected: {'_id': ..., 'status': 'connected'}`
- ⚠️ If connection fails: check IP whitelist, check password, check cluster is deployed. If still stuck after 10 min, fall back to local JSON files and revisit later.

**Minute 30–60 · Install Polymarket Package & Verify Data**
```bash
pip install polymarket-apis requests pandas numpy
```
```python
# test_polymarket.py
from polymarket_apis import PolymarketAPI

api = PolymarketAPI()

# 1. Fetch markets
markets = api.get_markets(limit=10, active=True)
for m in markets:
    print(f"Question: {m.get('question', 'N/A')}")
    print(f"  token_ids: {m.get('clobTokenIds', 'N/A')}")
    print(f"  outcomePrices: {m.get('outcomePrices', 'N/A')}")
    print(f"  volume: {m.get('volume', 'N/A')}")
    print("---")

# 2. Pick one token_id and test price history
token_id = markets[0]['clobTokenIds'][0]  # adjust based on actual field name
print(f"\nTesting price history for token: {token_id}")

history = api.get_price_history(token_id=token_id)
print(f"Got {len(history)} data points")
if len(history) > 0:
    print(f"Sample point: {history[0]}")
    print(f"Fields available: {list(history[0].keys())}")
```

**⚠️ IMPORTANT — the `polymarket-apis` package may have slightly different method names or field names than documented. If the above doesn't work:**
1. Try `from polymarket_apis import GammaClient` and check available methods
2. Fall back to raw requests:
```python
import requests

# Raw Gamma API — always works, no package needed
resp = requests.get("https://gamma-api.polymarket.com/markets", params={"active": "true", "limit": 10})
markets = resp.json()
print(f"Got {len(markets)} markets")
print(f"Fields: {list(markets[0].keys())}")
```
3. For price history, the raw endpoint is: `https://gamma-api.polymarket.com/prices/history?tokenId={token_id}&interval=2m`

**Minute 60–90 · Document the Actual Data Shape**
After confirming the API works, write down the EXACT field names and structure you see. Create a file:
```python
# data_shape.py — FILL THIS IN with actual fields you observed
"""
MARKET OBJECT FIELDS:
- question: str (the market title)
- clobTokenIds: list[str] (token IDs for Yes/No outcomes)
- outcomePrices: str (current prices, e.g. "[0.65, 0.35]")
- volume: str (total volume traded)
- liquidity: str
- active: bool
- closed: bool
- slug: str
- [ADD ANY OTHER RELEVANT FIELDS]

PRICE HISTORY POINT FIELDS:
- t: int (unix timestamp) OR timestamp: str (ISO format)
- p: float (price/probability 0-1) OR price: str
- [ADD ACTUAL FIELDS YOU SEE]
"""

# Example: save one market's full data for Person 2 and Person 3
SAMPLE_MARKET = {
    # paste actual market object here
}

SAMPLE_PRICE_HISTORY = [
    # paste first 5 price history points here
]
```
- 🔗 Push `data_shape.py` to repo or share in group chat — Person 2 and Person 3 need this to write their code
- ✅ Done when: you have a working API call, know the exact field names, and have shared them with the team

**Minute 90–120 · Store First Market in MongoDB**
```python
# seed_one_market.py
from pymongo import MongoClient
import requests  # or use polymarket_apis

MONGO_URI = "your_connection_string"
client = MongoClient(MONGO_URI)
db = client["shocktest"]

# Fetch one market + its price history
# (use whatever method worked in your testing above)
market = # ... fetch one market
token_id = # ... extract token_id
history = # ... fetch price history for that token_id

# Store in MongoDB
doc = {
    "market_id": market.get("id") or market.get("slug"),
    "source": "polymarket",
    "question": market["question"],
    "token_id": token_id,
    "volume": float(market.get("volume", 0)),
    "series": [{"t": point["t"], "p": float(point["p"])} for point in history],
    # ^ adjust field names based on what you actually see in the data
    "category": None  # Gemini fills this in later
}

db["market_series"].insert_one(doc)
print(f"Stored market: {doc['question']}")
print(f"  Points: {len(doc['series'])}")
print(f"  Time range: {doc['series'][0]['t']} to {doc['series'][-1]['t']}")

# Verify
stored = db["market_series"].find_one({"market_id": doc["market_id"]})
print(f"  Verified in MongoDB: {stored['question']}")
```
- 🔗 **DECISION GATE:** If Polymarket data has good 2-min resolution price history → proceed with Polymarket as primary. If data is sparse or missing → swap to Manifold as primary (see Manifold fallback below).
- ✅ Done when: one market document with time series is in MongoDB `market_series` collection

**Manifold Fallback (only if Polymarket fails):**
```python
import requests

# Manifold markets
resp = requests.get("https://manifold.markets/api/v0/markets", params={"limit": 10})
markets = resp.json()

# Manifold bet history (this IS the price history)
market_id = markets[0]["id"]
bets = requests.get(f"https://manifold.markets/api/v0/bets", params={"contractId": market_id, "limit": 1000}).json()
# Each bet has: createdTime (ms timestamp), probAfter (probability after this bet)
```

---

### Person 2 (Analysis)

**Minute 0–30 · Environment Setup**
```bash
pip install polymarket-apis pymongo requests pandas numpy google-generativeai
```
- Wait for Person 1's MongoDB connection string — add it to your environment
- Wait for Person 1's data shape confirmation

**Minute 30–60 · Help Verify Polymarket Data**
- Help Person 1 test the Polymarket API from your machine
- Independently verify: can you call `get_markets()` and `get_price_history()`?
- Look at the price history data specifically:
  - What's the time resolution? (should be ~2 min between points)
  - Are prices between 0 and 1?
  - Are there gaps in the time series?
  - How far back does history go?

```python
# analyze_data_quality.py
import pandas as pd

# Use the price history Person 1 fetched, or fetch your own
history = # ... however you get it

df = pd.DataFrame(history)
df['t'] = pd.to_datetime(df['t'], unit='s')  # adjust based on actual timestamp format
df = df.sort_values('t')

print(f"Time range: {df['t'].min()} to {df['t'].max()}")
print(f"Total points: {len(df)}")
print(f"Avg interval: {df['t'].diff().mean()}")
print(f"Price range: {df['p'].min():.4f} to {df['p'].max():.4f}")
print(f"Largest single-step move: {df['p'].diff().abs().max():.4f}")
```

**Minute 60–120 · Plan Metrics & Start Writing Helpers**
Once you know the data shape, start writing the analysis module structure:

```python
# analysis/__init__.py — leave empty

# analysis/helpers.py
import pandas as pd
import numpy as np
from pymongo import MongoClient

MONGO_URI = "your_connection_string"

def get_db():
    """Return MongoDB database handle."""
    client = MongoClient(MONGO_URI)
    return client["shocktest"]

def load_market_series(market_id: str) -> pd.DataFrame:
    """
    Load a market's price time series from MongoDB.
    Returns DataFrame with columns: t (datetime), p (float 0-1)
    """
    db = get_db()
    doc = db["market_series"].find_one({"market_id": market_id})
    if doc is None:
        raise ValueError(f"Market {market_id} not found")
    
    df = pd.DataFrame(doc["series"])
    df["t"] = pd.to_datetime(df["t"], unit="s")  # adjust unit based on actual data
    df = df.sort_values("t").reset_index(drop=True)
    return df

def get_delta(series: pd.DataFrame, window_minutes: int = 60) -> pd.Series:
    """
    Compute rolling price change over a time window.
    
    Args:
        series: DataFrame with columns t (datetime), p (float)
        window_minutes: lookback window in minutes
    
    Returns:
        Series of delta values aligned with the input index
    """
    # Resample to regular intervals first
    df = series.set_index("t").resample("2min").last().interpolate()
    
    # Number of periods in the window
    periods = window_minutes // 2  # 2-min resolution
    
    # Rolling delta
    delta = df["p"] - df["p"].shift(periods)
    return delta
```

- 🔗 Wait for Person 1's `data_shape.py` to confirm field names before finalizing
- ✅ Done when: `helpers.py` has `load_market_series()` and `get_delta()` implemented and tested against the sample market in MongoDB

---

### Person 3 (Frontend)

**Minute 0–30 · Scaffold Next.js App**
```bash
npx create-next-app@latest shocktest-dashboard --typescript --tailwind --app --eslint
cd shocktest-dashboard
npm install recharts mongodb
```

Project structure to aim for:
```
shocktest-dashboard/
├── app/
│   ├── layout.tsx          # Root layout with fonts, metadata
│   ├── page.tsx            # Main dashboard page
│   ├── api/
│   │   ├── shocks/route.ts     # GET /api/shocks — returns all shock events
│   │   ├── markets/route.ts    # GET /api/markets — returns market list
│   │   └── stats/route.ts      # GET /api/stats — returns aggregate stats
│   └── shock/[id]/
│       └── page.tsx        # Per-shock detail page with probability chart
├── components/
│   ├── ShocksTable.tsx     # Sortable, filterable shocks table
│   ├── PriceChart.tsx      # Recharts LineChart for probability over time
│   ├── StatsCards.tsx      # Summary stat cards (reversion rate, sample size, etc.)
│   ├── Histogram.tsx       # Distribution of post-shock moves
│   └── Header.tsx          # App header with title + branding
├── lib/
│   └── mongodb.ts          # MongoDB connection singleton
├── .env.local              # MONGODB_URI=mongodb+srv://...
└── package.json
```

**Minute 30–60 · MongoDB Connection + API Route Shell**

Create `.env.local`:
```
MONGODB_URI=mongodb+srv://shocktest-admin:<password>@shocktest.xxxxx.mongodb.net/shocktest?retryWrites=true&w=majority
```
(🔗 Get the connection string from Person 1)

```typescript
// lib/mongodb.ts
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add MONGODB_URI to .env.local');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };
  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
```

```typescript
// app/api/shocks/route.ts
import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('shocktest');
    
    const shocks = await db
      .collection('shock_events')
      .find({})
      .sort({ delta: -1 })
      .limit(100)
      .toArray();
    
    return NextResponse.json(shocks);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch shocks' }, { status: 500 });
  }
}
```

```typescript
// app/api/stats/route.ts
import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('shocktest');
    
    const stats = await db
      .collection('shock_results')
      .findOne({ _id: 'aggregate_stats' });
    
    return NextResponse.json(stats || {
      total_shocks: 0,
      reversion_rate_1h: null,
      reversion_rate_6h: null,
      reversion_rate_24h: null,
      mean_reversion_6h: null,
      sample_size: 0
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
```

```typescript
// app/api/markets/route.ts
import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('id');
    
    const client = await clientPromise;
    const db = client.db('shocktest');
    
    if (marketId) {
      // Return single market with full time series
      const market = await db
        .collection('market_series')
        .findOne({ market_id: marketId });
      return NextResponse.json(market);
    }
    
    // Return all markets (without full series for list view)
    const markets = await db
      .collection('market_series')
      .find({})
      .project({ series: 0 }) // exclude the big array for list queries
      .toArray();
    
    return NextResponse.json(markets);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 });
  }
}
```

**Minute 60–90 · Deploy Skeleton to Vercel**
```bash
npm install -g vercel
vercel login
vercel --prod
```
- Vercel will ask about settings — accept defaults
- Add environment variable in Vercel dashboard: Settings → Environment Variables → add `MONGODB_URI`
- ✅ Done when: you have a live URL like `shocktest-dashboard.vercel.app` that loads (even if blank)

**Minute 90–120 · Build with Dummy Data**
Since Person 1 is still populating MongoDB, build components using hardcoded dummy data that matches the expected schema:

```typescript
// lib/dummyData.ts
export const DUMMY_SHOCKS = [
  {
    market_id: "will-trump-win-2028",
    source: "polymarket",
    question: "Will Trump win the 2028 presidential election?",
    category: "politics",
    t1: "2026-03-15T14:00:00Z",
    t2: "2026-03-15T14:30:00Z",
    p_before: 0.42,
    p_after: 0.57,
    delta: 0.15,
    post_move_1h: -0.08,
    post_move_6h: -0.11,
    post_move_24h: -0.09,
    reversion_1h: 0.08,
    reversion_6h: 0.11,
    reversion_24h: 0.09,
  },
  {
    market_id: "btc-above-100k-june",
    source: "polymarket",
    question: "Will Bitcoin be above $100k on June 30?",
    category: "crypto",
    t1: "2026-03-20T09:00:00Z",
    t2: "2026-03-20T09:45:00Z",
    p_before: 0.65,
    p_after: 0.52,
    delta: -0.13,
    post_move_1h: 0.04,
    post_move_6h: 0.07,
    post_move_24h: 0.10,
    reversion_1h: 0.04,
    reversion_6h: 0.07,
    reversion_24h: 0.10,
  },
  // Add 5-8 more dummy shocks with varied categories, directions, magnitudes
];

export const DUMMY_STATS = {
  total_shocks: 47,
  reversion_rate_1h: 0.62,
  reversion_rate_6h: 0.68,
  reversion_rate_24h: 0.55,
  mean_reversion_6h: 0.034,
  std_reversion_6h: 0.021,
  sample_size: 47,
  by_category: {
    politics: { count: 18, reversion_rate_6h: 0.72 },
    crypto: { count: 15, reversion_rate_6h: 0.60 },
    sports: { count: 8, reversion_rate_6h: 0.63 },
    other: { count: 6, reversion_rate_6h: 0.67 },
  }
};

export const DUMMY_PRICE_SERIES = [
  // 100+ points simulating 2-min interval data around a shock
  // timestamps as ISO strings, prices as floats 0-1
  // Show: stable → sudden jump → partial reversion
];
```
- Use this dummy data to build all UI components before real data is ready
- When real data flows in during Hours 16–20, just remove the dummy imports and fetch from your API routes instead
- ✅ Done when: `npm run dev` serves a page at `localhost:3000` that shows dummy data

---

## HOUR 2–6 · Data Pipeline

### Person 1 (Data Pipeline)

**Goal:** Fetch 50+ Polymarket markets with full price history and store in MongoDB. Then pull supplemental Manifold markets.

```python
# fetch_polymarket.py
from pymongo import MongoClient
import requests
import time

MONGO_URI = "your_connection_string"
client = MongoClient(MONGO_URI)
db = client["shocktest"]

def fetch_polymarket_markets(limit=100):
    """Fetch active binary markets from Polymarket, sorted by volume."""
    resp = requests.get("https://gamma-api.polymarket.com/markets", params={
        "active": "true",
        "limit": limit,
        "order": "volume24hr",
        "ascending": "false"
    })
    resp.raise_for_status()
    markets = resp.json()
    
    # Filter: binary outcomes only, reasonable volume
    binary_markets = []
    for m in markets:
        token_ids = m.get("clobTokenIds", [])
        # adjust parsing based on actual data shape from data_shape.py
        if len(token_ids) == 2 and float(m.get("volume", 0)) > 1000:
            binary_markets.append(m)
    
    print(f"Found {len(binary_markets)} binary markets with volume > $1000")
    return binary_markets

def fetch_price_history(token_id: str):
    """
    Fetch full price history for a token at 2-min resolution.
    Adjust endpoint/params based on what actually worked in Hour 0-2 testing.
    """
    # Option A: use polymarket-apis package
    # from polymarket_apis import PolymarketAPI
    # api = PolymarketAPI()
    # return api.get_price_history(token_id=token_id)
    
    # Option B: raw request (more reliable)
    resp = requests.get(f"https://gamma-api.polymarket.com/prices/history", params={
        "tokenId": token_id,
        "interval": "max",  # or specific range — test what works
        "fidelity": 2,      # 2-min candles — test what works
    })
    if resp.status_code == 200:
        return resp.json()
    else:
        print(f"  Failed for {token_id}: {resp.status_code}")
        return []

def store_market(market: dict, history: list):
    """Store one market + its price history in MongoDB."""
    # Extract token_id (Yes outcome — adjust based on actual data)
    token_id = market["clobTokenIds"][0]  # typically first is Yes
    
    doc = {
        "market_id": market.get("id") or market.get("slug") or market.get("conditionId"),
        "source": "polymarket",
        "question": market["question"],
        "token_id": token_id,
        "volume": float(market.get("volume", 0)),
        "series": [],  # will be populated below
        "category": None,  # Gemini fills this in Hours 10-16
    }
    
    # Normalize price history to consistent format
    for point in history:
        # ADJUST these field names based on actual API response
        doc["series"].append({
            "t": point.get("t") or point.get("timestamp"),
            "p": float(point.get("p") or point.get("price", 0))
        })
    
    # Sort by time
    doc["series"].sort(key=lambda x: x["t"])
    
    # Upsert (avoid duplicates)
    db["market_series"].update_one(
        {"market_id": doc["market_id"]},
        {"$set": doc},
        upsert=True
    )
    
    return len(doc["series"])

# Main loop
if __name__ == "__main__":
    markets = fetch_polymarket_markets(limit=100)
    
    for i, market in enumerate(markets[:60]):  # start with 60, expand later
        question = market["question"][:60]
        token_id = market["clobTokenIds"][0]
        
        print(f"[{i+1}/{len(markets)}] {question}...")
        
        history = fetch_price_history(token_id)
        if len(history) < 10:
            print(f"  Skipping — only {len(history)} data points")
            continue
        
        n_points = store_market(market, history)
        print(f"  Stored {n_points} price points")
        
        time.sleep(0.5)  # be polite to the API
    
    # Summary
    count = db["market_series"].count_documents({"source": "polymarket"})
    print(f"\n=== Total Polymarket markets in MongoDB: {count} ===")
```

**After Polymarket, fetch supplemental Manifold markets (20–30):**
```python
# fetch_manifold.py
import requests
import time
from pymongo import MongoClient

MONGO_URI = "your_connection_string"
client = MongoClient(MONGO_URI)
db = client["shocktest"]

def fetch_manifold_markets(limit=30):
    """Fetch active binary markets from Manifold."""
    resp = requests.get("https://manifold.markets/api/v0/markets", params={"limit": limit})
    markets = resp.json()
    
    # Filter for binary (BINARY outcomeType)
    binary = [m for m in markets if m.get("outcomeType") == "BINARY" and not m.get("isResolved")]
    print(f"Found {len(binary)} active binary Manifold markets")
    return binary

def fetch_manifold_bets(contract_id: str, limit=5000):
    """Fetch bet history for a Manifold market — this IS the price history."""
    resp = requests.get("https://manifold.markets/api/v0/bets", params={
        "contractId": contract_id,
        "limit": limit,
    })
    return resp.json()

def store_manifold_market(market: dict, bets: list):
    """Convert Manifold bets to time series and store in MongoDB."""
    doc = {
        "market_id": f"manifold_{market['id']}",
        "source": "manifold",
        "question": market["question"],
        "token_id": market["id"],
        "volume": float(market.get("volume", 0)),
        "series": [],
        "category": None,
    }
    
    for bet in bets:
        doc["series"].append({
            "t": bet["createdTime"] / 1000,  # Manifold uses ms timestamps
            "p": float(bet.get("probAfter", 0))
        })
    
    doc["series"].sort(key=lambda x: x["t"])
    
    # Deduplicate / downsample if too many points
    # (Manifold can have many bets per minute)
    
    db["market_series"].update_one(
        {"market_id": doc["market_id"]},
        {"$set": doc},
        upsert=True
    )
    return len(doc["series"])

if __name__ == "__main__":
    markets = fetch_manifold_markets(limit=30)
    
    for i, market in enumerate(markets):
        print(f"[{i+1}/{len(markets)}] {market['question'][:60]}...")
        bets = fetch_manifold_bets(market["id"])
        if len(bets) < 20:
            print(f"  Skipping — only {len(bets)} bets")
            continue
        n = store_manifold_market(market, bets)
        print(f"  Stored {n} points")
        time.sleep(0.3)
    
    total = db["market_series"].count_documents({})
    poly = db["market_series"].count_documents({"source": "polymarket"})
    mani = db["market_series"].count_documents({"source": "manifold"})
    print(f"\n=== MongoDB totals: {total} markets ({poly} Polymarket, {mani} Manifold) ===")
```

- 🔗 Person 2 can start running shock detection as soon as markets appear in MongoDB — ping them when you have ≥20 markets stored
- ✅ Done when: ≥50 Polymarket + ≥20 Manifold markets with price history in MongoDB `market_series` collection

---

### Person 2 (Analysis)

**Goal:** Write the core shock detection and delta calculation functions. Test against real data as soon as Person 1 has markets in MongoDB.

**Hour 2–4 · Implement Core Analysis Functions**

```python
# analysis/shock_detector.py
import pandas as pd
import numpy as np
from pymongo import MongoClient
from datetime import datetime, timedelta

MONGO_URI = "your_connection_string"

def get_db():
    client = MongoClient(MONGO_URI)
    return client["shocktest"]

def load_market_series(market_id: str) -> pd.DataFrame:
    """
    Load market price series from MongoDB.
    Returns DataFrame with columns: t (datetime), p (float 0-1)
    """
    db = get_db()
    doc = db["market_series"].find_one({"market_id": market_id})
    if not doc or not doc.get("series"):
        return pd.DataFrame()
    
    df = pd.DataFrame(doc["series"])
    
    # Handle timestamp format — adjust based on actual data
    if isinstance(df["t"].iloc[0], (int, float)):
        df["t"] = pd.to_datetime(df["t"], unit="s")
    else:
        df["t"] = pd.to_datetime(df["t"])
    
    df["p"] = df["p"].astype(float)
    df = df.sort_values("t").reset_index(drop=True)
    df = df.drop_duplicates(subset=["t"])
    return df

def resample_to_regular(df: pd.DataFrame, interval_min: int = 2) -> pd.DataFrame:
    """
    Resample irregular time series to fixed intervals.
    Forward-fills gaps, interpolates where possible.
    """
    if df.empty:
        return df
    
    df = df.set_index("t")
    df = df.resample(f"{interval_min}min").last()
    df = df.interpolate(method="time", limit=5)  # fill gaps up to 10 min
    df = df.dropna()
    df = df.reset_index()
    return df

def find_shocks(
    market_id: str,
    theta: float = 0.08,
    window_minutes: int = 60,
    interval_min: int = 2,
) -> list[dict]:
    """
    Detect probability shocks in a market's time series.
    
    A shock occurs when |p(t2) - p(t1)| >= theta within window_minutes.
    
    Args:
        market_id: ID of market in MongoDB
        theta: minimum absolute probability change to qualify as shock (default 0.08 = 8pp)
        window_minutes: time window to look for the move (default 60 min)
        interval_min: data resolution in minutes (default 2)
    
    Returns:
        List of shock dicts: {market_id, t1, t2, p_before, p_after, delta}
    """
    df = load_market_series(market_id)
    if df.empty or len(df) < 10:
        return []
    
    df = resample_to_regular(df, interval_min)
    if df.empty:
        return []
    
    lookback = window_minutes // interval_min  # number of periods in window
    shocks = []
    
    for i in range(lookback, len(df)):
        # Look at the change from i-lookback to i
        p_now = df.loc[i, "p"]
        p_then = df.loc[i - lookback, "p"]
        delta = p_now - p_then
        
        if abs(delta) >= theta:
            shock = {
                "market_id": market_id,
                "t1": df.loc[i - lookback, "t"].isoformat(),
                "t2": df.loc[i, "t"].isoformat(),
                "p_before": round(float(p_then), 4),
                "p_after": round(float(p_now), 4),
                "delta": round(float(delta), 4),
                "abs_delta": round(abs(float(delta)), 4),
            }
            shocks.append(shock)
    
    # Deduplicate: if multiple consecutive rows trigger, keep only the largest
    if not shocks:
        return []
    
    deduped = [shocks[0]]
    for s in shocks[1:]:
        prev = deduped[-1]
        # If this shock's t2 is within the window of the previous shock's t2, keep the larger one
        t2_prev = pd.Timestamp(prev["t2"])
        t2_curr = pd.Timestamp(s["t2"])
        if (t2_curr - t2_prev).total_seconds() < window_minutes * 60:
            if s["abs_delta"] > prev["abs_delta"]:
                deduped[-1] = s  # replace with larger shock
        else:
            deduped.append(s)
    
    return deduped
```

**Hour 4–6 · Test Shock Detector on Real Data**
```python
# test_shock_detection.py
from analysis.shock_detector import find_shocks, get_db

db = get_db()

# Get all market IDs from MongoDB
market_ids = db["market_series"].distinct("market_id")
print(f"Testing shock detection on {len(market_ids)} markets...")

all_shocks = []
for mid in market_ids:
    shocks = find_shocks(mid, theta=0.08, window_minutes=60)
    if shocks:
        print(f"  {mid}: {len(shocks)} shocks found")
        for s in shocks:
            print(f"    {s['t1']} → {s['t2']}: {s['p_before']:.2f} → {s['p_after']:.2f} (Δ={s['delta']:+.2f})")
    all_shocks.extend(shocks)

print(f"\n=== Total shocks found (θ=0.08): {len(all_shocks)} ===")

# If too few shocks, try lower threshold
if len(all_shocks) < 15:
    print("\nToo few shocks at θ=0.08, trying θ=0.05...")
    all_shocks_05 = []
    for mid in market_ids:
        shocks = find_shocks(mid, theta=0.05, window_minutes=60)
        all_shocks_05.extend(shocks)
    print(f"Total shocks at θ=0.05: {len(all_shocks_05)}")
```

- Store detected shocks in MongoDB:
```python
# After detection runs:
for shock in all_shocks:
    # Add metadata from the market doc
    market_doc = db["market_series"].find_one({"market_id": shock["market_id"]})
    shock["question"] = market_doc.get("question", "")
    shock["source"] = market_doc.get("source", "")
    shock["category"] = market_doc.get("category")  # None until Gemini fills it

db["shock_events"].drop()  # clear previous runs
if all_shocks:
    db["shock_events"].insert_many(all_shocks)
    print(f"Stored {len(all_shocks)} shocks in MongoDB")
```

- 🔗 Ping Person 3: shock_events collection now has data — they can start fetching from `/api/shocks`
- ✅ Done when: `shock_events` collection in MongoDB has ≥15 shock records. If not, lower theta to 0.05.

---

### Person 3 (Frontend)

**Goal:** Build the core UI components using dummy data. All components should be swappable to real data later by just changing the data source from dummy imports to fetch calls.

**Hour 2–4 · Shocks Table Component**
```typescript
// components/ShocksTable.tsx
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

interface Shock {
  market_id: string;
  question: string;
  source: string;
  category: string | null;
  t1: string;
  t2: string;
  p_before: number;
  p_after: number;
  delta: number;
  abs_delta: number;
  reversion_6h?: number;
}

interface ShocksTableProps {
  shocks: Shock[];
}

export default function ShocksTable({ shocks }: ShocksTableProps) {
  const [sortBy, setSortBy] = useState<'abs_delta' | 't2' | 'category'>('abs_delta');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  const categories = useMemo(() => {
    const cats = new Set(shocks.map(s => s.category).filter(Boolean));
    return ['all', ...Array.from(cats)];
  }, [shocks]);
  
  const sorted = useMemo(() => {
    let filtered = categoryFilter === 'all' 
      ? shocks 
      : shocks.filter(s => s.category === categoryFilter);
    
    return filtered.sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      if (sortBy === 'abs_delta') return mul * (a.abs_delta - b.abs_delta);
      if (sortBy === 't2') return mul * (new Date(a.t2).getTime() - new Date(b.t2).getTime());
      return 0;
    });
  }, [shocks, sortBy, sortDir, categoryFilter]);
  
  // Build this out with Claude Code — sortable headers, category filter dropdown,
  // color-coded delta values (green for positive, red for negative),
  // clickable rows that link to /shock/[market_id]
  
  return (
    <div>
      {/* Category filter buttons */}
      {/* Table with sortable headers */}
      {/* Each row links to /shock/[market_id] for detail view */}
    </div>
  );
}
```

**Hour 4–6 · Price Chart Component**
```typescript
// components/PriceChart.tsx
'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';

interface PricePoint {
  t: string;  // ISO timestamp
  p: number;  // probability 0-1
}

interface PriceChartProps {
  series: PricePoint[];
  shockT1?: string;  // shock window start
  shockT2?: string;  // shock window end
}

export default function PriceChart({ series, shockT1, shockT2 }: PriceChartProps) {
  const data = series.map(point => ({
    time: new Date(point.t).toLocaleString(),
    timestamp: new Date(point.t).getTime(),
    probability: point.p * 100,  // display as percentage
  }));
  
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, 'Probability']} />
        <Line type="monotone" dataKey="probability" stroke="#2563eb" dot={false} strokeWidth={2} />
        
        {/* Highlight shock window */}
        {shockT1 && shockT2 && (
          <ReferenceArea
            x1={new Date(shockT1).toLocaleString()}
            x2={new Date(shockT2).toLocaleString()}
            fill="#ef4444"
            fillOpacity={0.15}
            label="Shock"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- Build both components, test with dummy data at `localhost:3000`
- Have Claude Code polish the styling — use Tailwind for layout, spacing, colors
- ✅ Done when: shocks table renders with dummy data and is sortable; price chart renders a line with highlighted shock window

---

## HOUR 6–10 · Shock Detection at Scale

### Person 1 (Data Pipeline)

**Goal:** Ensure data quality. Resample all time series to consistent intervals. Expand to 100+ markets if possible.

```python
# resample_all.py
"""
Go through all markets in MongoDB and ensure consistent time series format.
"""
from pymongo import MongoClient
import pandas as pd

MONGO_URI = "your_connection_string"
db = MongoClient(MONGO_URI)["shocktest"]

markets = list(db["market_series"].find({}))
print(f"Processing {len(markets)} markets...")

for market in markets:
    series = market.get("series", [])
    if len(series) < 10:
        print(f"  SKIP {market['market_id']}: only {len(series)} points")
        continue
    
    df = pd.DataFrame(series)
    
    # Ensure timestamps are unix seconds (float)
    if isinstance(df["t"].iloc[0], str):
        df["t"] = pd.to_datetime(df["t"]).astype(int) // 10**9
    
    # Ensure prices are float 0-1
    df["p"] = df["p"].astype(float)
    if df["p"].max() > 1:
        df["p"] = df["p"] / 100  # might be in percentage format
    
    # Remove duplicates
    df = df.drop_duplicates(subset=["t"]).sort_values("t")
    
    # Report quality
    time_range_hrs = (df["t"].max() - df["t"].min()) / 3600
    avg_gap_min = df["t"].diff().mean() / 60
    
    print(f"  {market['market_id'][:40]}: {len(df)} pts, {time_range_hrs:.0f}h range, ~{avg_gap_min:.1f}min avg gap")
    
    # Update MongoDB
    db["market_series"].update_one(
        {"_id": market["_id"]},
        {"$set": {"series": df.to_dict("records")}}
    )

print("Done resampling.")
```

- If you have <80 markets, fetch more Polymarket or Manifold markets
- ✅ Done when: all markets have clean, sorted time series with consistent timestamp format

---

### Person 2 (Analysis)

**Goal:** Run shock detection on all markets. Manually verify a few shocks look real.

Run the shock detection from Hour 2–6 on all markets. Then manually spot-check:

```python
# verify_shocks.py
"""
Pull 3-5 detected shocks and visually inspect them.
Print the price series around each shock so you can confirm they look real.
"""
from analysis.shock_detector import load_market_series, get_db
import pandas as pd

db = get_db()
shocks = list(db["shock_events"].find().sort("abs_delta", -1).limit(5))

for shock in shocks:
    print(f"\n{'='*60}")
    print(f"Market: {shock.get('question', shock['market_id'])}")
    print(f"Shock: {shock['p_before']:.2f} → {shock['p_after']:.2f} (Δ={shock['delta']:+.2f})")
    print(f"Time: {shock['t1']} → {shock['t2']}")
    
    # Load full series and show context
    df = load_market_series(shock["market_id"])
    t2 = pd.Timestamp(shock["t2"])
    
    # Show 2 hours before and 2 hours after the shock
    window = df[(df["t"] >= t2 - pd.Timedelta(hours=2)) & (df["t"] <= t2 + pd.Timedelta(hours=2))]
    
    print(f"\nPrice context (±2h around shock):")
    for _, row in window.iterrows():
        marker = " <<<" if abs((row["t"] - t2).total_seconds()) < 120 else ""
        print(f"  {row['t']}  p={row['p']:.4f}{marker}")
```

- If shocks look like data artifacts (e.g., a market going from 0.50 to 0.99 because it resolved), add a filter to exclude resolved/closed markets
- ✅ Done when: you've visually confirmed that ≥3 detected shocks represent real market moves, not artifacts

---

### Person 3 (Frontend)

**Goal:** Build the per-shock detail page and start on the histogram component.

**Per-Shock Detail Page:**
```typescript
// app/shock/[id]/page.tsx
// This page shows:
// 1. Market question as title
// 2. Shock details (before/after price, delta, time window)
// 3. Full probability chart with shock window highlighted
// 4. Post-shock stats (1h/6h/24h reversion) if available

// Fetch market series from /api/markets?id={market_id}
// Fetch shock details from /api/shocks (filter by market_id)
// Render PriceChart component with the series data + shock window
```

**Histogram Component:**
```typescript
// components/Histogram.tsx
// Shows distribution of post-shock probability moves
// X-axis: reversion magnitude (negative = continuation, positive = reversion)
// Y-axis: count of shocks
// Use Recharts BarChart with bins

// Key design choices:
// - Color bars: green for reversion (positive), red for continuation (negative)
// - Add vertical reference line at x=0
// - Show mean reversion as a dashed vertical line
// - Label the axes clearly for demo
```

**Stats Cards Component:**
```typescript
// components/StatsCards.tsx
// 3-4 summary cards at top of dashboard:
// 1. "Total Shocks Detected" — large number
// 2. "6h Reversion Rate" — percentage with color coding (>50% = green)
// 3. "Mean Reversion Magnitude" — percentage points
// 4. "Markets Analyzed" — count
// 
// Use a clean card grid with Tailwind
```

- ✅ Done when: detail page renders with dummy data, histogram shows dummy distribution, stats cards display

---

## HOUR 10–16 · Post-Shock Analysis + Gemini Categorization

### Person 1 (Data Pipeline)

**Goal:** Expand to 100+ markets total. Support Person 2 with any data quality issues.

- Fetch remaining Polymarket markets to hit 80+
- Fetch additional Manifold markets to hit 100+ total
- Monitor MongoDB storage (free tier = 512MB — check in Atlas dashboard)
- Help Person 2 debug any data format issues
- If ahead of schedule: start building the export/README

---

### Person 2 (Analysis)

**Goal:** Compute post-shock outcomes. Integrate Gemini for market categorization. Generate aggregate statistics.

**Post-Shock Outcome Computation:**
```python
# analysis/post_shock.py
import pandas as pd
import numpy as np
from analysis.shock_detector import load_market_series, get_db

def compute_post_shock_outcomes(shock: dict, horizons_hours: list = [1, 6, 24]) -> dict:
    """
    For a detected shock, measure what happens at each horizon.
    
    Args:
        shock: dict with market_id, t2, delta
        horizons_hours: list of hours to measure after the shock
    
    Returns:
        dict with post_move_Xh and reversion_Xh for each horizon
    """
    df = load_market_series(shock["market_id"])
    if df.empty:
        return {}
    
    t2 = pd.Timestamp(shock["t2"])
    p_at_shock = shock["p_after"]
    shock_direction = np.sign(shock["delta"])
    
    results = {}
    for h in horizons_hours:
        target_time = t2 + pd.Timedelta(hours=h)
        
        # Find the closest data point to the target time
        time_diffs = abs(df["t"] - target_time)
        closest_idx = time_diffs.idxmin()
        closest_time = df.loc[closest_idx, "t"]
        
        # Only use if within 30 min of target
        if abs((closest_time - target_time).total_seconds()) > 1800:
            results[f"post_move_{h}h"] = None
            results[f"reversion_{h}h"] = None
            continue
        
        p_later = df.loc[closest_idx, "p"]
        post_move = p_later - p_at_shock
        reversion = -shock_direction * post_move
        
        results[f"post_move_{h}h"] = round(float(post_move), 4)
        results[f"reversion_{h}h"] = round(float(reversion), 4)
    
    return results

def run_all_post_shock_analysis():
    """Compute outcomes for all detected shocks and save to MongoDB."""
    db = get_db()
    shocks = list(db["shock_events"].find({}))
    print(f"Computing post-shock outcomes for {len(shocks)} shocks...")
    
    for i, shock in enumerate(shocks):
        outcomes = compute_post_shock_outcomes(shock)
        
        if outcomes:
            db["shock_events"].update_one(
                {"_id": shock["_id"]},
                {"$set": outcomes}
            )
            rev_6h = outcomes.get("reversion_6h")
            rev_str = f"{rev_6h:+.4f}" if rev_6h is not None else "N/A"
            print(f"  [{i+1}] {shock.get('question', '')[:50]}... reversion_6h={rev_str}")
    
    print("Done.")

if __name__ == "__main__":
    run_all_post_shock_analysis()
```

**Gemini Categorization (~30 min):**
```python
# analysis/categorize.py
import google.generativeai as genai
from pymongo import MongoClient
import time

# Get API key from https://aistudio.google.com/apikey
# Free tier: 10 RPM, 250 req/day — plenty for 100 markets
GEMINI_API_KEY = "your_key_here"  # get from Google AI Studio
MONGO_URI = "your_connection_string"

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

db = MongoClient(MONGO_URI)["shocktest"]

def categorize_market(question: str) -> str:
    """Use Gemini to classify a market into a category."""
    prompt = (
        "Classify this prediction market into exactly one category: "
        "politics, sports, crypto, entertainment, science, or other. "
        f"Market: '{question}'. "
        "Respond with only the category name in lowercase, nothing else."
    )
    
    try:
        response = model.generate_content(prompt)
        category = response.text.strip().lower()
        # Validate it's one of our expected categories
        valid = {"politics", "sports", "crypto", "entertainment", "science", "other"}
        if category not in valid:
            category = "other"
        return category
    except Exception as e:
        print(f"  Gemini error: {e}")
        return "other"

def categorize_all_markets():
    """Categorize all markets that don't have a category yet."""
    markets = list(db["market_series"].find({"category": None}))
    print(f"Categorizing {len(markets)} markets with Gemini...")
    
    for i, market in enumerate(markets):
        question = market["question"]
        category = categorize_market(question)
        
        db["market_series"].update_one(
            {"_id": market["_id"]},
            {"$set": {"category": category}}
        )
        
        # Also update any shock_events for this market
        db["shock_events"].update_many(
            {"market_id": market["market_id"]},
            {"$set": {"category": category}}
        )
        
        print(f"  [{i+1}/{len(markets)}] {category:15s} | {question[:60]}")
        time.sleep(7)  # stay well under 10 RPM limit
    
    # Print summary
    pipeline = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}]
    for doc in db["market_series"].aggregate(pipeline):
        print(f"  {doc['_id']}: {doc['count']} markets")

if __name__ == "__main__":
    categorize_all_markets()
```

**Aggregate Statistics:**
```python
# analysis/aggregate.py
import numpy as np
from pymongo import MongoClient

MONGO_URI = "your_connection_string"
db = MongoClient(MONGO_URI)["shocktest"]

def compute_aggregate_stats():
    """Compute and store aggregate statistics across all shocks."""
    shocks = list(db["shock_events"].find({}))
    
    if not shocks:
        print("No shocks found!")
        return
    
    # Overall stats
    reversions_1h = [s["reversion_1h"] for s in shocks if s.get("reversion_1h") is not None]
    reversions_6h = [s["reversion_6h"] for s in shocks if s.get("reversion_6h") is not None]
    reversions_24h = [s["reversion_24h"] for s in shocks if s.get("reversion_24h") is not None]
    
    stats = {
        "_id": "aggregate_stats",
        "total_shocks": len(shocks),
        "total_markets": len(set(s["market_id"] for s in shocks)),
        
        # 1h horizon
        "reversion_rate_1h": round(np.mean([r > 0 for r in reversions_1h]), 4) if reversions_1h else None,
        "mean_reversion_1h": round(float(np.mean(reversions_1h)), 4) if reversions_1h else None,
        "std_reversion_1h": round(float(np.std(reversions_1h)), 4) if reversions_1h else None,
        "sample_size_1h": len(reversions_1h),
        
        # 6h horizon (headline metric)
        "reversion_rate_6h": round(np.mean([r > 0 for r in reversions_6h]), 4) if reversions_6h else None,
        "mean_reversion_6h": round(float(np.mean(reversions_6h)), 4) if reversions_6h else None,
        "std_reversion_6h": round(float(np.std(reversions_6h)), 4) if reversions_6h else None,
        "sample_size_6h": len(reversions_6h),
        
        # 24h horizon
        "reversion_rate_24h": round(np.mean([r > 0 for r in reversions_24h]), 4) if reversions_24h else None,
        "mean_reversion_24h": round(float(np.mean(reversions_24h)), 4) if reversions_24h else None,
        "sample_size_24h": len(reversions_24h),
        
        # By category breakdown
        "by_category": {}
    }
    
    # Category breakdown
    categories = set(s.get("category") for s in shocks if s.get("category"))
    for cat in categories:
        cat_shocks = [s for s in shocks if s.get("category") == cat]
        cat_rev_6h = [s["reversion_6h"] for s in cat_shocks if s.get("reversion_6h") is not None]
        
        stats["by_category"][cat] = {
            "count": len(cat_shocks),
            "reversion_rate_6h": round(np.mean([r > 0 for r in cat_rev_6h]), 4) if cat_rev_6h else None,
            "mean_reversion_6h": round(float(np.mean(cat_rev_6h)), 4) if cat_rev_6h else None,
            "sample_size_6h": len(cat_rev_6h),
        }
    
    # Store in MongoDB (upsert)
    db["shock_results"].update_one(
        {"_id": "aggregate_stats"},
        {"$set": stats},
        upsert=True
    )
    
    # Print headline results
    print(f"\n{'='*60}")
    print(f"SHOCKTEST RESULTS")
    print(f"{'='*60}")
    print(f"Total shocks detected: {stats['total_shocks']}")
    print(f"Across {stats['total_markets']} markets")
    print(f"\n6-Hour Reversion Rate: {stats['reversion_rate_6h']:.1%}" if stats['reversion_rate_6h'] else "")
    print(f"Mean 6h Reversion: {stats['mean_reversion_6h']:.2%}" if stats['mean_reversion_6h'] else "")
    print(f"Sample size: {stats['sample_size_6h']}")
    print(f"\nBy category:")
    for cat, data in stats["by_category"].items():
        rate = data.get("reversion_rate_6h")
        print(f"  {cat}: {data['count']} shocks, 6h reversion rate = {rate:.1%}" if rate else f"  {cat}: {data['count']} shocks")
    
    return stats

if __name__ == "__main__":
    compute_aggregate_stats()
```

- 🔗 Once aggregate stats are in MongoDB `shock_results` collection, ping Person 3 — the `/api/stats` route will now return real data
- ✅ Done when: `shock_results` collection has one document with `_id: "aggregate_stats"` containing real numbers. Shock events all have `reversion_Xh` fields and `category` fields populated.

---

### Person 3 (Frontend)

**Goal:** Build the aggregate histogram and stats cards. Set up layout/navigation. Start connecting to real API routes as data becomes available.

**Hour 10–12 · Histogram + Stats Cards**
- Build the histogram component showing distribution of post-shock moves
- Build stats cards showing headline numbers
- Wire both to dummy data initially

**Hour 12–14 · Layout and Navigation**
```
Main page (/) should show:
├── Header: "ShockTest — Do Prediction Markets Overreact?"
├── Subtitle: "Analyzing mean reversion in Polymarket probability shocks"
├── Stats Cards row (4 cards)
├── Findings paragraph (1-2 sentences with real numbers, filled in later)
├── Shocks Table (sortable, filterable)
├── Aggregate Histogram
└── Footer: "Powered by Polymarket · Data stored in MongoDB Atlas · Categories by Google Gemini"

Detail page (/shock/[id]) should show:
├── Back link to main page
├── Market question as title
├── Shock details (delta, time window, category)
├── Full price chart with shock highlight
└── Post-shock outcomes table (1h, 6h, 24h)
```

**Hour 14–16 · Start Wiring Real Data**
- Check if Person 2's data is in MongoDB by hitting your API routes:
  - `http://localhost:3000/api/shocks` — should return shock events
  - `http://localhost:3000/api/stats` — should return aggregate stats
- If real data is available, start replacing dummy data imports with `fetch('/api/...')` calls
- If not yet available, keep using dummy data — you'll swap in Hours 16–20

- ✅ Done when: full page layout works with either dummy or real data, navigation between main page and detail pages works

---

## HOUR 16–20 · MVP Dashboard (Integration)

### Person 1 (Data Pipeline)

**Goal:** MVP is complete. Support bug fixes and help Person 3 with data format issues.

- Monitor MongoDB — make sure all data is consistent
- If Person 3 reports data format issues with the API routes, fix them
- Start writing `README.md`:
```markdown
# ShockTest — Do Prediction Markets Overreact?

## Hypothesis
[paste from plan]

## Methodology
[paste from plan]

## Results
[fill in with actual numbers from aggregate stats]

## Tech Stack
- **Data**: Polymarket Gamma API (2-min price history) + Manifold Markets
- **Storage**: MongoDB Atlas (free M0 cluster)
- **Analysis**: Python (pandas, numpy)
- **Categorization**: Google Gemini 2.5 Flash
- **Frontend**: Next.js + Recharts + Tailwind CSS
- **Deployment**: Vercel + GoDaddy custom domain

## Team
[names]

## Built at YHack Spring 2026
```

---

### Person 2 (Analysis)

**Goal:** Validate results. Write the findings text. Help Person 3 with data interpretation.

**Validate Results Manually:**
```python
# Check: do the numbers make sense?
# - Is reversion rate between 40-70%? (too high or too low might indicate a bug)
# - Is mean reversion magnitude reasonable (1-5 percentage points)?
# - Do category breakdowns have enough samples per category (≥5)?
# - Are there any NaN or null values that shouldn't be there?

# Write the findings paragraph that Person 3 will display on the dashboard:
FINDINGS = """
In our analysis of {total_shocks} probability shocks across {total_markets} 
Polymarket and Manifold markets, we found that {reversion_rate_6h:.0%} of shocks 
showed mean reversion within 6 hours, with an average reversion magnitude of 
{mean_reversion_6h:.1%} percentage points. Political markets reverted at a rate 
of {politics_rate:.0%}, compared to {crypto_rate:.0%} for crypto markets — 
suggesting that political shocks may be more driven by overreaction to headlines, 
while crypto market moves are more likely to reflect genuine information.
"""
# Fill in actual numbers and store in MongoDB or share with Person 3
```

- 🔗 Share the findings text with Person 3 to display on the dashboard
- ✅ Done when: results are validated, findings text is written, and Person 3 has it

---

### Person 3 (Frontend)

**Goal:** Wire all real data into the dashboard. Everything should show real numbers, not dummy data.

**Hour 16–18 · Replace Dummy Data with API Calls**
- Every component that uses `DUMMY_SHOCKS`, `DUMMY_STATS`, etc. should now fetch from your API routes
- Pattern for each component:
```typescript
// In any page or component:
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetch('/api/shocks')
    .then(res => res.json())
    .then(data => { setData(data); setLoading(false); })
    .catch(err => { console.error(err); setLoading(false); });
}, []);
```

**Hour 18–20 · Polish and Deploy**
- Add the findings paragraph from Person 2 to the top of the dashboard
- Add "Powered by Polymarket" logo/text in footer
- Add data source badges (Polymarket, MongoDB, Gemini)
- Deploy to Vercel:
```bash
vercel --prod
```
- Point GoDaddy domain to Vercel:
  - In Vercel: Settings → Domains → add `shocktest.xyz`
  - In GoDaddy: DNS → add CNAME record pointing to `cname.vercel-dns.com`
  - Or use Vercel's nameservers (Vercel will show instructions)

- ✅ Done when: `shocktest.xyz` loads the dashboard with real data from MongoDB

---

## HOUR 20–24 · Polish + Stretch + Submissions

### Person 1 (Data Pipeline)

**Stretch: Fade Strategy Backtest**
```python
# analysis/backtest.py
"""
Fade strategy: when a shock is detected, simulate taking the opposite position.
For each shock:
  - Entry: at p_after (the shock price)
  - Exit: at p(t2 + 6h) (6 hours later)
  - P&L: reversion_6h (already computed)

Report:
  - Win rate (% of trades with positive reversion)
  - Average P&L per trade
  - Total simulated P&L
  - Sharpe-like ratio
  
IMPORTANT CAVEATS to include:
  - This is in-sample only (no out-of-sample validation)
  - Ignores transaction costs / slippage / liquidity
  - Ignores the cost of monitoring markets 24/7
  - Small sample size — not statistically robust for trading
"""
```

---

### Person 2 (Analysis)

**Stretch: Category Breakdown Analysis**
- Build a table showing reversion rate by category
- If sample sizes allow, compute statistical significance (chi-squared test or simple confidence intervals)
- Write 2-3 sentences interpreting the category differences

**Write Devpost Description:**
Draft the project description for Devpost submission. Include:
- What it does (1 paragraph)
- How we built it (tech stack, 1 paragraph)
- What we found (results with numbers, 1 paragraph)
- Challenges we ran into
- What we learned
- Built with: Polymarket API, MongoDB Atlas, Google Gemini, Next.js, Vercel, Python

---

### Person 3 (Frontend)

**Hour 20–22 · Best UI/UX Polish (30 min focused session)**
Use Claude Code to:
- Apply a consistent color palette via Tailwind config (not default blue — pick something distinctive)
- Ensure chart labels are readable (font size, contrast, axis labels)
- Add smooth transitions/animations on page load (fade-in for cards, etc.)
- Make layout responsive (test at mobile width)
- Add visual hierarchy — the headline finding should be the most prominent element
- Clean up any rough edges (loading states, error states, empty states)

**Hour 22–23 · Film Most Viral Post Reel**
- Screen-record a 30-second walkthrough:
  - Show a dramatic shock in the table
  - Click into it — show the price chart spiking and reverting
  - Show the aggregate stats
  - End with the URL: `shocktest.xyz`
- Post to Instagram as reel, tag @yhack.yale

**Hour 23–24 · Final Deploy + Submission**
```bash
# Final production deploy
vercel --prod

# Verify everything works
curl https://shocktest.xyz
curl https://shocktest.xyz/api/shocks
curl https://shocktest.xyz/api/stats
```

**Submit on Devpost (yhack-2026.devpost.com):**
- Project name: ShockTest
- Tagline: "Do Prediction Markets Overreact?"
- Select tracks: Prediction Markets, Most Creative Hack, Best UI/UX
- Add demo URL: `shocktest.xyz`
- Add GitHub repo link
- Add demo video (can reuse the reel or record a longer walkthrough)
- Paste the description Person 2 wrote

---

## MongoDB Collections Reference

All three team members should know this schema:

```
Database: shocktest

Collection: market_series
{
  market_id: string,       // unique identifier
  source: "polymarket" | "manifold",
  question: string,        // market title
  token_id: string,        // Polymarket token ID or Manifold contract ID
  volume: float,           // total volume traded
  series: [                // time series of prices
    { t: float (unix seconds), p: float (0-1) },
    ...
  ],
  category: string | null  // "politics", "sports", "crypto", "entertainment", "science", "other"
}

Collection: shock_events
{
  market_id: string,
  source: string,
  question: string,
  category: string | null,
  t1: string (ISO),        // shock window start
  t2: string (ISO),        // shock window end (shock peak)
  p_before: float,
  p_after: float,
  delta: float,            // signed change (positive = up, negative = down)
  abs_delta: float,        // absolute change
  post_move_1h: float | null,
  post_move_6h: float | null,
  post_move_24h: float | null,
  reversion_1h: float | null,
  reversion_6h: float | null,
  reversion_24h: float | null,
}

Collection: shock_results
{
  _id: "aggregate_stats",
  total_shocks: int,
  total_markets: int,
  reversion_rate_1h: float,
  reversion_rate_6h: float,    // HEADLINE METRIC
  reversion_rate_24h: float,
  mean_reversion_6h: float,
  std_reversion_6h: float,
  sample_size_6h: int,
  by_category: {
    "politics": { count, reversion_rate_6h, mean_reversion_6h, sample_size_6h },
    "crypto": { ... },
    "sports": { ... },
    ...
  }
}
```

---

## Handoff Checklist

| Time | From | To | What |
|------|------|----|------|
| Min 20 | Person 1 | All | MongoDB connection string |
| Min 90 | Person 1 | Person 2, 3 | `data_shape.py` — actual API field names |
| Hour 2 | Person 1 | All | Decision gate: Polymarket primary or Manifold primary |
| Hour 4 | Person 1 | Person 2 | ≥20 markets in MongoDB — Person 2 can start shock detection |
| Hour 6 | Person 2 | Person 3 | shock_events in MongoDB — `/api/shocks` returns real data |
| Hour 14 | Person 2 | Person 3 | aggregate stats in MongoDB — `/api/stats` returns real data |
| Hour 14 | Person 2 | Person 3 | categories populated — shocks have category field |
| Hour 18 | Person 2 | Person 3 | Findings paragraph text for dashboard display |
| Hour 22 | Person 2 | Person 3 | Devpost project description draft |
