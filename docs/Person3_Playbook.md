# Person 3 (Frontend) — Full Playbook

Everything you need in one place. Follow this hour by hour.

---

## Your Role

You own **everything in `dashboard/`**. You build the Next.js frontend that reads
data from MongoDB and displays it as a polished analytics dashboard.

**Tech stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Recharts, MongoDB

**Commit prefix:** `P3:`

---

## What You're Waiting On (from teammates)

| When       | From     | What you get                                          |
|------------|----------|-------------------------------------------------------|
| Minute 20  | Person 1 | MongoDB connection string (put in `.env.local`)       |
| Hour 6     | Person 2 | `shock_events` collection populated — `/api/shocks` works |
| Hour 14    | Person 2 | `shock_results` + categories populated — `/api/stats` works |
| Hour 18    | Person 2 | Findings paragraph text to display on dashboard       |

**You do NOT need to wait for any of this to start building.** Use dummy data
until real data flows in, then swap.

---

## HOUR 0–2 — Scaffold + API Routes + Dummy Data

### Minute 0–30 — Scaffold the App

```bash
npx create-next-app@latest dashboard --typescript --tailwind --app --eslint
cd dashboard
npm install recharts mongodb
```

Target structure:
```
dashboard/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Main dashboard
│   ├── globals.css
│   ├── api/
│   │   ├── shocks/route.ts        # GET /api/shocks
│   │   ├── markets/route.ts       # GET /api/markets?id=X
│   │   └── stats/route.ts         # GET /api/stats
│   └── shock/[id]/
│       └── page.tsx               # Per-shock detail page
├── components/
│   ├── Header.tsx
│   ├── StatsCards.tsx
│   ├── FindingsBlock.tsx
│   ├── ShocksTable.tsx
│   ├── PriceChart.tsx
│   ├── Histogram.tsx
│   ├── CategoryBreakdown.tsx
│   ├── LoadingSpinner.tsx
│   └── Footer.tsx
└── lib/
    ├── mongodb.ts                  # DB connection singleton
    ├── types.ts                    # Shared TypeScript interfaces
    └── dummyData.ts                # Fake data for building UI
```

Done when: `npm run dev` works and shows the default Next.js page.

---

### Minute 30–60 — MongoDB Connection + API Routes

**1. Create `.env.local`** (get the connection string from Person 1):
```
MONGODB_URI=mongodb+srv://shocktest-admin:<password>@shocktest.xxxxx.mongodb.net/shocktest?retryWrites=true&w=majority
```

**2. Create `lib/mongodb.ts`** — a singleton that reuses the DB connection:
```typescript
import { MongoClient } from "mongodb";

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

let clientPromise: Promise<MongoClient>;

if (!process.env.MONGODB_URI) {
  clientPromise = Promise.reject(new Error("Please add MONGODB_URI to .env.local"));
  clientPromise.catch(() => {});
} else if (process.env.NODE_ENV === "development") {
  if (!globalWithMongo._mongoClientPromise) {
    globalWithMongo._mongoClientPromise = new MongoClient(process.env.MONGODB_URI).connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  clientPromise = new MongoClient(process.env.MONGODB_URI).connect();
}

export default clientPromise;
```

**3. Create `lib/types.ts`** — these match the MongoDB schemas exactly:
```typescript
export interface PricePoint {
  t: number;    // unix timestamp (seconds)
  p: number;    // probability 0-1
}

export interface Market {
  _id: string;
  market_id: string;
  source: "polymarket" | "manifold";
  question: string;
  token_id: string;
  volume: number;
  category: string | null;
  series?: PricePoint[];
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
  delta: number;           // signed
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
  _id: string;
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

**4. Create 3 API routes** — each reads from MongoDB:

`app/api/shocks/route.ts` — returns all shocks sorted by size:
```typescript
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = await clientPromise;
  const shocks = await client.db("shocktest")
    .collection("shock_events")
    .find({}).sort({ abs_delta: -1 }).limit(100).toArray();
  return NextResponse.json(shocks);
}
```

`app/api/stats/route.ts` — returns the single aggregate stats document:
```typescript
const stats = await client.db("shocktest")
  .collection("shock_results")
  .findOne({ _id: "aggregate_stats" });
return NextResponse.json(stats || { total_shocks: 0, ... });
```

`app/api/markets/route.ts` — returns market list or single market with series:
```typescript
const marketId = searchParams.get("id");
if (marketId) {
  // Single market with full price series
  const market = await db.collection("market_series").findOne({ market_id: marketId });
  return NextResponse.json(market);
}
// List without the big series array
const markets = await db.collection("market_series")
  .find({}).project({ series: 0 }).toArray();
return NextResponse.json(markets);
```

Done when: API routes exist (they'll return errors until MongoDB is connected — that's fine).

---

### Minute 60–90 — Deploy Skeleton to Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

- Accept default settings when prompted
- In Vercel dashboard: Settings → Environment Variables → add `MONGODB_URI`

Done when: you have a live URL like `shocktest-dashboard.vercel.app` that loads.

---

### Minute 90–120 — Build with Dummy Data

Create `lib/dummyData.ts` with 8+ fake shocks, aggregate stats, and a generated
price series. Use this to build all components before real data is ready.

Done when: `npm run dev` at `localhost:3000` shows dummy data in the UI.

---

## HOUR 2–6 — Core Components (Table + Chart)

### ShocksTable Component
- Sortable by delta, category, source, reversion
- Category dropdown filter
- Color-coded delta values (green = up, red = down)
- Each row links to `/shock/[id]` for detail view

### PriceChart Component
- Recharts `LineChart` showing probability (0-100%) over time
- Red `ReferenceArea` highlighting the shock window
- Tooltip showing exact probability at each point
- Responsive via `ResponsiveContainer`

Done when: table renders with dummy data and is sortable. Chart shows a line
with the shock window highlighted in red.

---

## HOUR 6–10 — Detail Page + Histogram + Stats Cards

### Shock Detail Page (`/shock/[id]`)
Layout:
```
← Back to dashboard
Market Question Title
Source: polymarket · Category: politics · Shock: 42% → 57% (+15pp)
┌─────────────────────────────────────┐
│     Probability Over Time Chart     │
│     (shock window highlighted)      │
└─────────────────────────────────────┘
Post-Shock Outcomes:
  Horizon    Post Move    Reversion
  1 hour     -8.0pp       +8.0pp
  6 hours    -11.0pp      +11.0pp
  24 hours   -9.0pp       +9.0pp
```

### Histogram Component
- Bar chart showing distribution of 6h reversion values
- Green bars = reversion (price moved back), Red bars = continuation
- X-axis: reversion magnitude in bins, Y-axis: count

### StatsCards Component
4 cards in a row:
1. **Total Shocks** — big number
2. **6h Reversion Rate** — percentage (the headline metric)
3. **Mean Reversion (6h)** — percentage points
4. **Markets Analyzed** — count

### FindingsBlock Component
1-2 sentence summary paragraph with real numbers plugged in, e.g.:
> "In a sample of 47 shocks across 83 prediction markets, 68% showed mean
> reversion within 6 hours, with an average magnitude of 3.4 percentage points."

Done when: detail page, histogram, stats cards, and findings block all render
with dummy data. Full page layout works.

---

## HOUR 10–16 — Layout + Category Breakdown + Start Wiring Real Data

### CategoryBreakdown Component
Table showing reversion rate per market category:
```
Category    Shocks    6h Reversion Rate    Mean Reversion
politics    18        72%                  4.1pp
crypto      15        60%                  2.9pp
sports      8         63%                  3.2pp
other       6         67%                  3.5pp
```

### Main Page Layout
```
Header
├── StatsCards (4 cards in a row)
├── FindingsBlock (summary paragraph)
├── ShocksTable (sortable, filterable)
├── Histogram (bar chart)
├── CategoryBreakdown (table)
Footer ("Powered by Polymarket · MongoDB Atlas · Google Gemini")
```

### Start Checking for Real Data
Test if Person 2's data is flowing:
```bash
curl http://localhost:3000/api/shocks
curl http://localhost:3000/api/stats
```

If real data appears, start replacing dummy imports with `fetch()` calls.
If not, keep using dummy data — you'll swap in Hours 16–20.

Done when: full layout works, navigation between main page and detail pages works.

---

## HOUR 16–20 — Wire Real Data + Deploy

### Hour 16–18 — Replace Dummy Data with API Calls

For each page/component using dummy data, switch to fetching from API:
```typescript
"use client";
import { useState, useEffect } from "react";

const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetch("/api/shocks")
    .then(res => res.json())
    .then(data => { setData(data); setLoading(false); })
    .catch(() => setLoading(false));
}, []);
```

### Hour 18–20 — Polish and Deploy

- Add the findings paragraph text from Person 2
- Add "Powered by Polymarket" attribution in footer
- Deploy:
```bash
vercel --prod
```

- Point the GoDaddy domain to Vercel:
  - Vercel: Settings → Domains → add `shocktest.xyz`
  - GoDaddy: DNS → CNAME record → `cname.vercel-dns.com`

Done when: `shocktest.xyz` loads the dashboard with **real data** from MongoDB.

---

## HOUR 20–24 — Polish for Best UI/UX + Submit

### Hour 20–22 — UI/UX Polish (aim for Best UI/UX prize)

Focus areas:
- **Color palette** — pick something distinctive via Tailwind config, not default blue
- **Chart readability** — proper font sizes, contrast, axis labels
- **Visual hierarchy** — headline finding should be the most prominent element
- **Animations** — fade-in on page load, smooth transitions
- **Responsive** — test at mobile width, make sure tables scroll
- **Edge cases** — loading states, error states, empty states

### Hour 22–23 — Film Most Viral Post Reel

Screen-record a 30-second walkthrough:
1. Show a dramatic shock in the table
2. Click into it — show the price chart spiking and reverting
3. Show the aggregate stats
4. End with the URL: `shocktest.xyz`

Post to Instagram as a reel, tag **@yhack.yale**.

### Hour 23–24 — Final Deploy + Devpost Submission

```bash
vercel --prod
```

Verify everything:
```bash
curl https://shocktest.xyz
curl https://shocktest.xyz/api/shocks
curl https://shocktest.xyz/api/stats
```

Submit on Devpost (`yhack-2026.devpost.com`):
- Project name: **ShockTest**
- Tagline: "Do Prediction Markets Overreact?"
- Tracks: Prediction Markets, Most Creative Hack, Best UI/UX
- Add demo URL, GitHub link, demo video
- Paste description from Person 2

---

## Quick Reference — Commands

```bash
# Dev server
npm run dev                  # localhost:3000

# Check your code before pushing
npx eslint .                 # lint
npx tsc --noEmit             # typecheck
npm run build                # full build (catches everything)

# Deploy
vercel --prod

# Test API routes (while dev server is running)
curl http://localhost:3000/api/shocks
curl http://localhost:3000/api/stats
curl http://localhost:3000/api/markets
```

---

## Quick Reference — File Ownership

Everything in `dashboard/` is yours. Don't touch `scripts/` or `analysis/`.

| File                              | What it does                                |
|-----------------------------------|---------------------------------------------|
| `lib/types.ts`                    | TypeScript interfaces for all data shapes   |
| `lib/mongodb.ts`                  | Database connection (shared by API routes)   |
| `lib/dummyData.ts`                | Fake data for building UI before real data   |
| `app/api/shocks/route.ts`        | Returns shock events from MongoDB            |
| `app/api/markets/route.ts`       | Returns market list or single market         |
| `app/api/stats/route.ts`         | Returns aggregate statistics                 |
| `app/page.tsx`                    | Main dashboard page                          |
| `app/shock/[id]/page.tsx`        | Per-shock detail page                        |
| `components/Header.tsx`           | Title bar                                    |
| `components/StatsCards.tsx`       | 4 summary metric cards                       |
| `components/FindingsBlock.tsx`    | Summary paragraph with real numbers          |
| `components/ShocksTable.tsx`      | Sortable, filterable shocks table            |
| `components/PriceChart.tsx`       | Probability line chart with shock highlight  |
| `components/Histogram.tsx`        | Distribution of post-shock reversion values  |
| `components/CategoryBreakdown.tsx`| Reversion rate per category                  |
| `components/LoadingSpinner.tsx`   | Shared loading spinner                       |
| `components/Footer.tsx`           | Attribution line                             |
