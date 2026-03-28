# ShockTest — Repository Structure
## Reference for All Team Members + Claude Code

---

> **How to use this document:** Person 1 scaffolds the root repo and `scripts/` + `analysis/` directories. Person 3 scaffolds `dashboard/` via `npx create-next-app`. Everyone commits to the same repo but works in their own directories. Feed this document to Claude Code at the start of any session so it understands where everything lives.

---

## Top-Level Structure

```
shocktest/
├── README.md                          # Project overview, hypothesis, results, tech stack (Person 1 writes in Hours 20-24)
├── .gitignore                         # Node modules, .env files, __pycache__, .vercel
├── .env.example                       # Template for environment variables (no real secrets)
│
├── scripts/                           # Person 1 — data fetching scripts (Python)
│   ├── fetch_polymarket.py            # Fetch markets + price history from Polymarket Gamma API → MongoDB
│   ├── fetch_manifold.py              # Fetch supplemental markets from Manifold → MongoDB
│   ├── resample.py                    # Clean + normalize all time series in MongoDB
│   ├── test_polymarket.py             # Hour 0 verification — confirm API works, print data shape
│   ├── test_mongo.py                  # Hour 0 verification — confirm MongoDB connection
│   └── seed_one_market.py             # Hour 0 — store first market in MongoDB as proof of concept
│
├── analysis/                          # Person 2 — all analysis logic (Python)
│   ├── __init__.py
│   ├── helpers.py                     # load_market_series(), get_delta(), get_db()
│   ├── shock_detector.py              # find_shocks() — core shock detection algorithm
│   ├── post_shock.py                  # compute_post_shock_outcomes() — measure 1h/6h/24h reversion
│   ├── categorize.py                  # Gemini API integration — auto-tag markets by category
│   ├── aggregate.py                   # compute_aggregate_stats() — headline metrics → MongoDB
│   ├── backtest.py                    # Stretch: fade strategy backtest
│   ├── verify_shocks.py              # Manual verification — print context around detected shocks
│   └── run_all.py                     # Master script: detect shocks → compute outcomes → categorize → aggregate
│
├── dashboard/                         # Person 3 — Next.js frontend (generated via create-next-app)
│   ├── package.json
│   ├── package-lock.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── .env.local                     # MONGODB_URI=mongodb+srv://... (not committed)
│   ├── vercel.json                    # Optional — Vercel config for custom domain
│   │
│   ├── public/
│   │   └── polymarket-logo.svg        # "Powered by Polymarket" attribution asset
│   │
│   ├── app/
│   │   ├── layout.tsx                 # Root layout — fonts, metadata, global styles
│   │   ├── page.tsx                   # Main dashboard page — stats cards, findings, table, histogram
│   │   ├── globals.css                # Tailwind imports + any custom CSS
│   │   │
│   │   ├── api/
│   │   │   ├── shocks/
│   │   │   │   └── route.ts           # GET /api/shocks — returns shock events from MongoDB
│   │   │   ├── markets/
│   │   │   │   └── route.ts           # GET /api/markets?id=X — returns market list or single market with series
│   │   │   └── stats/
│   │   │       └── route.ts           # GET /api/stats — returns aggregate statistics
│   │   │
│   │   └── shock/
│   │       └── [id]/
│   │           └── page.tsx           # Per-shock detail page — price chart + post-shock outcomes
│   │
│   ├── components/
│   │   ├── Header.tsx                 # App header — title, subtitle, branding
│   │   ├── StatsCards.tsx             # Summary metric cards (total shocks, reversion rate, etc.)
│   │   ├── FindingsBlock.tsx          # 1-2 sentence findings paragraph with real numbers
│   │   ├── ShocksTable.tsx            # Sortable, filterable table of all detected shocks
│   │   ├── PriceChart.tsx             # Recharts LineChart — probability over time with shock highlight
│   │   ├── Histogram.tsx              # Recharts BarChart — distribution of post-shock moves
│   │   ├── CategoryBreakdown.tsx      # Table or bar chart showing reversion rate by category
│   │   ├── Footer.tsx                 # Attribution: Polymarket, MongoDB, Gemini logos/text
│   │   └── LoadingSpinner.tsx         # Shared loading state component
│   │
│   └── lib/
│       ├── mongodb.ts                 # MongoDB connection singleton (shared by all API routes)
│       ├── types.ts                   # TypeScript interfaces: Shock, Market, Stats, PricePoint
│       └── dummyData.ts              # Hardcoded dummy data matching MongoDB schema (used until real data flows)
│
└── docs/
    ├── ShockTest_Plan_v2.md           # The strategic plan (hypothesis, methodology, prize strategy)
    └── ShockTest_Playbook.md          # The operational playbook (hour-by-hour instructions)
```

---

## File Descriptions — What Each File Does and Who Owns It

### Root

| File | Owner | Purpose |
|------|-------|---------|
| `README.md` | Person 1 (Hours 20-24) | Devpost-ready project description. Includes hypothesis, methodology, results (with real numbers), tech stack, team, and links. |
| `.gitignore` | Person 1 (Hour 0) | Must include: `node_modules/`, `.env`, `.env.local`, `__pycache__/`, `.vercel/`, `*.pyc` |
| `.env.example` | Person 1 (Hour 0) | Template showing required env vars without real values. Contents: `MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/shocktest` and `GEMINI_API_KEY=your_key_here` |

### scripts/ (Person 1)

| File | When | Purpose | Inputs | Outputs |
|------|------|---------|--------|---------|
| `test_mongo.py` | Hour 0 | Verify MongoDB Atlas connection works | `MONGODB_URI` env var | Prints success/failure |
| `test_polymarket.py` | Hour 0 | Verify Polymarket Gamma API returns usable data, document exact field names | None (public API) | Prints market fields, price history fields, data shape |
| `seed_one_market.py` | Hour 1 | Store one complete market + price history in MongoDB as proof of concept | Working API + MongoDB | One document in `market_series` collection |
| `fetch_polymarket.py` | Hours 2-6 | Bulk fetch 60-100 Polymarket markets with full price history | Public Gamma API | 60-100 documents in `market_series` (source: "polymarket") |
| `fetch_manifold.py` | Hours 4-6 | Fetch 20-30 supplemental Manifold markets | Public Manifold API | 20-30 documents in `market_series` (source: "manifold") |
| `resample.py` | Hours 6-8 | Normalize all time series: consistent timestamp format, remove duplicates, validate price range | `market_series` collection | Updated `market_series` documents with clean series |

### analysis/ (Person 2)

| File | When | Purpose | Inputs | Outputs |
|------|------|---------|--------|---------|
| `helpers.py` | Hours 2-4 | Shared utility functions: `get_db()`, `load_market_series()`, `get_delta()` | `MONGODB_URI` | Used by all other analysis modules |
| `shock_detector.py` | Hours 4-8 | Core algorithm: `find_shocks(market_id, theta, window_minutes)` scans a market's time series for probability jumps exceeding threshold | `market_series` docs | List of shock dicts; bulk-stored in `shock_events` collection |
| `post_shock.py` | Hours 10-14 | `compute_post_shock_outcomes()` measures p(t2+1h), p(t2+6h), p(t2+24h) for each shock and computes reversion | `shock_events` + `market_series` | Updates `shock_events` docs with `reversion_Xh` fields |
| `categorize.py` | Hours 10-14 | Calls Gemini 2.5 Flash to classify each market title into politics/sports/crypto/etc. | `market_series` titles + Gemini API key | Updates `category` field in both `market_series` and `shock_events` |
| `aggregate.py` | Hours 14-16 | Computes headline stats: reversion rates, means, by-category breakdown | `shock_events` (with outcomes + categories) | One document in `shock_results` with `_id: "aggregate_stats"` |
| `verify_shocks.py` | Hours 8-10 | Prints price context around top 5 detected shocks for manual sanity check | `shock_events` + `market_series` | Console output only — visual verification |
| `backtest.py` | Hours 20-24 (stretch) | Simulates fade-the-shock strategy, reports win rate and average P&L | `shock_events` (with outcomes) | Console output + optional doc in `shock_results` |
| `run_all.py` | Hours 14-16 | Orchestrates the full pipeline: detect → outcomes → categorize → aggregate | All of the above | All collections populated |

### dashboard/ (Person 3)

#### API Routes

| Route | Method | Purpose | Returns |
|-------|--------|---------|---------|
| `/api/shocks` | GET | All detected shocks, sorted by abs_delta descending | `Shock[]` — array of shock objects with market info, delta, reversion values, category |
| `/api/markets` | GET | List all markets (without series) | `Market[]` — array with market_id, question, source, category, volume |
| `/api/markets?id=X` | GET | Single market with full price series | `Market` — includes `series: PricePoint[]` |
| `/api/stats` | GET | Aggregate statistics | `Stats` — reversion rates, means, sample sizes, by_category breakdown |

#### Components

| Component | Purpose | Data Source | Key Libraries |
|-----------|---------|-------------|---------------|
| `Header.tsx` | App title bar: "ShockTest — Do Prediction Markets Overreact?" | Static | Tailwind |
| `StatsCards.tsx` | 4 metric cards: Total Shocks, 6h Reversion Rate, Mean Reversion, Markets Analyzed | `/api/stats` | Tailwind |
| `FindingsBlock.tsx` | 1-2 sentence summary paragraph with actual numbers injected | `/api/stats` + hardcoded template | Tailwind |
| `ShocksTable.tsx` | Sortable table of all shocks. Columns: Market, Source, Category, Delta, Time, 6h Reversion. Rows link to `/shock/[id]` | `/api/shocks` | React state for sort/filter |
| `PriceChart.tsx` | Line chart of probability over time. Red shaded region for shock window. Used on detail page. | `/api/markets?id=X` | `recharts` (LineChart, ReferenceArea) |
| `Histogram.tsx` | Bar chart showing distribution of post-shock reversion values. Green bars (reversion) vs red (continuation). | `/api/shocks` (compute bins client-side) | `recharts` (BarChart) |
| `CategoryBreakdown.tsx` | Table or grouped bar chart showing reversion rate per category | `/api/stats` → `by_category` | `recharts` or plain HTML table |
| `Footer.tsx` | Attribution line: "Powered by Polymarket · MongoDB Atlas · Google Gemini" | Static | Tailwind |
| `LoadingSpinner.tsx` | Shared loading state while fetching data | None | Tailwind animate-spin |

#### Pages

| Page | Route | Layout |
|------|-------|--------|
| Main Dashboard | `/` | Header → StatsCards → FindingsBlock → ShocksTable → Histogram → CategoryBreakdown → Footer |
| Shock Detail | `/shock/[id]` | Header → Back link → Market title → Shock metadata → PriceChart → Post-shock outcomes table → Footer |

#### Lib

| File | Purpose |
|------|---------|
| `mongodb.ts` | MongoDB client singleton. Used by all API routes. Reads `MONGODB_URI` from `.env.local`. |
| `types.ts` | TypeScript interfaces shared across components. See below. |
| `dummyData.ts` | Hardcoded data matching the real MongoDB schema. Person 3 builds against this until real data flows (~Hour 14-16), then swaps to API fetches. |

---

## TypeScript Interfaces (dashboard/lib/types.ts)

```typescript
export interface PricePoint {
  t: number;    // unix timestamp (seconds)
  p: number;    // probability 0-1
}

export interface Market {
  _id: string;
  market_id: string;
  source: 'polymarket' | 'manifold';
  question: string;
  token_id: string;
  volume: number;
  category: string | null;
  series?: PricePoint[];  // only included when fetching single market
}

export interface Shock {
  _id: string;
  market_id: string;
  source: string;
  question: string;
  category: string | null;
  t1: string;              // ISO timestamp
  t2: string;              // ISO timestamp
  p_before: number;
  p_after: number;
  delta: number;           // signed (-0.15 = dropped 15pp)
  abs_delta: number;       // absolute value
  post_move_1h: number | null;
  post_move_6h: number | null;
  post_move_24h: number | null;
  reversion_1h: number | null;
  reversion_6h: number | null;
  reversion_24h: number | null;
}

export interface CategoryStats {
  count: number;
  reversion_rate_6h: number | null;
  mean_reversion_6h: number | null;
  sample_size_6h: number;
}

export interface AggregateStats {
  _id: string;             // always "aggregate_stats"
  total_shocks: number;
  total_markets: number;
  reversion_rate_1h: number | null;
  reversion_rate_6h: number | null;
  reversion_rate_24h: number | null;
  mean_reversion_1h: number | null;
  mean_reversion_6h: number | null;
  mean_reversion_24h: number | null;
  std_reversion_6h: number | null;
  sample_size_1h: number;
  sample_size_6h: number;
  sample_size_24h: number;
  by_category: Record<string, CategoryStats>;
}
```

---

## MongoDB Collections (Shared Contract)

All three people code against this schema. If anyone changes a field name, they must tell the other two.

```
Database: shocktest

┌─────────────────────────────────────────────────────────┐
│ Collection: market_series                                │
│ Written by: Person 1 (scripts/)                          │
│ Read by: Person 2 (analysis/), Person 3 (dashboard/api/) │
├─────────────────────────────────────────────────────────┤
│ {                                                        │
│   market_id: string        // unique ID                  │
│   source: string           // "polymarket" or "manifold" │
│   question: string         // market title               │
│   token_id: string         // API-specific token ID      │
│   volume: float            // total volume               │
│   series: [                // price time series           │
│     { t: float, p: float } // unix seconds, prob 0-1     │
│   ]                                                      │
│   category: string | null  // filled by Gemini later     │
│ }                                                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Collection: shock_events                                 │
│ Written by: Person 2 (analysis/)                         │
│ Read by: Person 3 (dashboard/api/)                       │
├─────────────────────────────────────────────────────────┤
│ {                                                        │
│   market_id: string                                      │
│   source: string                                         │
│   question: string                                       │
│   category: string | null                                │
│   t1: string (ISO)         // shock start                │
│   t2: string (ISO)         // shock peak                 │
│   p_before: float                                        │
│   p_after: float                                         │
│   delta: float             // signed change              │
│   abs_delta: float         // |delta|                    │
│   post_move_1h: float | null                             │
│   post_move_6h: float | null                             │
│   post_move_24h: float | null                            │
│   reversion_1h: float | null                             │
│   reversion_6h: float | null                             │
│   reversion_24h: float | null                            │
│ }                                                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Collection: shock_results                                │
│ Written by: Person 2 (analysis/)                         │
│ Read by: Person 3 (dashboard/api/)                       │
├─────────────────────────────────────────────────────────┤
│ {                                                        │
│   _id: "aggregate_stats"                                 │
│   total_shocks: int                                      │
│   total_markets: int                                     │
│   reversion_rate_6h: float  // HEADLINE METRIC           │
│   mean_reversion_6h: float                               │
│   std_reversion_6h: float                                │
│   sample_size_6h: int                                    │
│   by_category: {                                         │
│     "politics": { count, reversion_rate_6h, ... }        │
│     "crypto": { ... }                                    │
│     ...                                                  │
│   }                                                      │
│ }                                                        │
└─────────────────────────────────────────────────────────┘
```

---

## Environment Variables

Each person needs these in their local environment:

| Variable | Who Needs It | Where It Goes | Source |
|----------|-------------|---------------|--------|
| `MONGODB_URI` | All 3 | Person 1 & 2: top of Python scripts or shell env. Person 3: `dashboard/.env.local` | Person 1 creates in Hour 0, shares via group chat |
| `GEMINI_API_KEY` | Person 2 only | Top of `analysis/categorize.py` or shell env | Person 2 creates at Google AI Studio in Hour 10 |

**`.env.example`** (committed to repo):
```
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/shocktest?retryWrites=true&w=majority
GEMINI_API_KEY=your_gemini_api_key_here
```

**`.gitignore`** must include:
```
.env
.env.local
node_modules/
__pycache__/
*.pyc
.vercel/
.next/
```

---

## Git Workflow

Keep it simple — no branches, no PRs, no code review. This is a 24-hour hackathon.

```
Main branch: main

Person 1 commits to: scripts/*, analysis/helpers.py (shared), README.md, root files
Person 2 commits to: analysis/*
Person 3 commits to: dashboard/*

Conflict risk: NEAR ZERO — each person works in their own directory.
The only shared file is analysis/helpers.py (Person 1 seeds it, Person 2 extends it).
```

**Commit pattern:**
```bash
git add .
git commit -m "P1: fetched 60 polymarket markets"
git push

# Before starting a new block, always pull:
git pull
```

Prefix commit messages with P1/P2/P3 so you can see who did what.

---

## How to Initialize the Repo (Person 1, Minute 0)

```bash
mkdir shocktest && cd shocktest
git init

# Create structure
mkdir -p scripts analysis dashboard docs

# Root files
touch README.md .gitignore .env.example
touch analysis/__init__.py

# .gitignore
cat > .gitignore << 'EOF'
.env
.env.local
node_modules/
__pycache__/
*.pyc
.vercel/
.next/
EOF

# .env.example
cat > .env.example << 'EOF'
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/shocktest?retryWrites=true&w=majority
GEMINI_API_KEY=your_gemini_api_key_here
EOF

# Initial commit
git add .
git commit -m "P1: initial repo structure"

# Create GitHub repo and push
# (do this via github.com/new or gh repo create)
git remote add origin git@github.com:YOUR_USERNAME/shocktest.git
git push -u origin main
```

**Person 3 then initializes the dashboard inside the repo:**
```bash
cd shocktest
npx create-next-app@latest dashboard --typescript --tailwind --app --eslint
cd dashboard
npm install recharts mongodb
# Create .env.local with MONGODB_URI from Person 1
git add .
git commit -m "P3: scaffold next.js dashboard"
git push
```

---

## Claude Code Prompt Template

When starting a Claude Code session, paste something like this:

**Person 1:**
```
I'm building ShockTest, a prediction market analysis tool for a hackathon. I'm Person 1 (Data Pipeline). Here's our repo structure: [paste this doc]. Here's our playbook for my current time block: [paste relevant section from Playbook]. 

I'm currently in Hour [X]. My task is: [specific task from playbook].

The MongoDB connection string is: [paste].
The Polymarket Gamma API base URL is: https://gamma-api.polymarket.com

Build what's described in the playbook. Follow the file paths and function signatures exactly.
```

**Person 2:**
```
I'm building ShockTest, a prediction market analysis tool for a hackathon. I'm Person 2 (Analysis). Here's our repo structure: [paste this doc]. Here's our playbook for my current time block: [paste relevant section from Playbook].

I'm currently in Hour [X]. My task is: [specific task from playbook].

The MongoDB connection string is: [paste].
The MongoDB schema for market_series and shock_events is: [paste from this doc].

Build what's described in the playbook. Follow the file paths, function signatures, and MongoDB field names exactly.
```

**Person 3:**
```
I'm building ShockTest, a prediction market analysis tool for a hackathon. I'm Person 3 (Frontend). Here's our repo structure: [paste this doc]. Here's our playbook for my current time block: [paste relevant section from Playbook].

I'm currently in Hour [X]. My task is: [specific task from playbook].

The MongoDB connection string is: [paste].
The TypeScript interfaces for the data are: [paste from this doc].
The API routes are: /api/shocks, /api/markets, /api/stats — schemas described in this doc.

Build what's described in the playbook using Next.js, TypeScript, Tailwind CSS, and Recharts. Follow the component names and file paths exactly.
```
