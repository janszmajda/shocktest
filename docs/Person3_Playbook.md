# Person 3 (Frontend) — Full Playbook v2

Everything you need in one place. Follow this hour by hour.

**v2 changes:** Project pivoted from "research dashboard" to "trading signal + decision tool." New components: **Trade Simulator**, **Dashboard Controls** (θ slider, horizon picker). New API route: `/api/backtest`. Fade-strategy backtest is now core, not stretch.

---

## Your Role

You own **everything in `dashboard/`**. You build the Next.js frontend that reads
data from MongoDB and displays it as an interactive trading signal + analytics dashboard.

**Tech stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Recharts, MongoDB

**Commit prefix:** `P3:`

---

## What You're Waiting On (from teammates)

| When       | From     | What you get                                          |
|------------|----------|-------------------------------------------------------|
| Minute 20  | Person 1 | MongoDB connection string (put in `.env.local`) ✅     |
| Hour 6     | Person 2 | `shock_events` collection populated — `/api/shocks` works ✅ |
| Hour 14    | Person 2 | `shock_results` + categories populated — `/api/stats` works |
| **Hour 14** | **Person 1** | **Backtest + distribution data in MongoDB — `/api/backtest` works** |
| Hour 18    | Person 2 | Findings paragraph text to display on dashboard       |

**You do NOT need to wait for any of this to start building.** Use dummy data
until real data flows in, then swap.

---

## HOURS 0–10 — COMPLETED ✅

Summary of what's built:

- ✅ Next.js app scaffolded with TypeScript, Tailwind, Recharts
- ✅ MongoDB connection singleton (`lib/mongodb.ts`)
- ✅ API routes: `/api/shocks`, `/api/markets`, `/api/stats` — reading from MongoDB
- ✅ Skeleton deployed to Vercel
- ✅ `lib/types.ts` with all TypeScript interfaces
- ✅ `lib/dummyData.ts` with mock data
- ✅ ShocksTable component (sortable, filterable, color-coded, clickable rows)
- ✅ PriceChart component (Recharts LineChart with shock window highlight, 0-100% Y-axis)
- ✅ Per-shock detail page (`/shock/[id]`) with chart + outcomes table
- ✅ Histogram component (green/red bars, reference lines at 0 and mean)
- ✅ StatsCards component (4 cards, color-coded reversion rate)
- ✅ FindingsBlock, CategoryBreakdown, Header, Footer, LoadingSpinner
- ✅ Main page wired to try real API data, fallback to dummy
- ✅ Detail page wired to try real API data, fallback to dummy

---

## HOUR 10–16 — CORE TRADING TOOL BUILD (CURRENT PHASE)

This is the critical phase. By Hour 16, the project transforms from "research dashboard" into "trading decision tool."

### Hour 10–12 — Trade Simulator Component

This is the most important new component. It goes on the per-shock detail page.

```typescript
// components/TradeSimulator.tsx
'use client';

import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';

interface BacktestStats {
  win_rate_6h: number;
  avg_pnl_per_dollar_6h: number;
  max_drawdown_6h: number;
  by_category: Record<string, {
    win_rate_6h: number;
    avg_pnl_6h: number;
    sample_size: number;
  }>;
}

interface DistributionData {
  bin_edges: number[];
  bin_counts: number[];
  percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  mean: number;
  std: number;
  min: number;
  max: number;
}

interface TradeSimulatorProps {
  shockDelta: number;           // the shock's delta
  shockCategory: string | null; // category of this shock's market
  backtest: BacktestStats;      // from /api/backtest
  distribution: DistributionData; // from /api/backtest
}

export default function TradeSimulator({ shockDelta, shockCategory, backtest, distribution }: TradeSimulatorProps) {
  const [positionSize, setPositionSize] = useState(100);
  const [horizon, setHorizon] = useState<'1h' | '6h' | '24h'>('6h');

  // Use category-specific stats if available, otherwise overall
  const catStats = shockCategory ? backtest.by_category[shockCategory] : null;
  const winRate = catStats?.win_rate_6h ?? backtest.win_rate_6h;
  const avgPnl = catStats?.avg_pnl_6h ?? backtest.avg_pnl_per_dollar_6h;

  // Compute projected outcomes
  const expectedPnl = positionSize * avgPnl;
  const bestCase = positionSize * distribution.percentiles.p90;
  const worstCase = positionSize * distribution.percentiles.p10;
  const medianPnl = positionSize * distribution.percentiles.p50;

  // Build histogram data for chart
  const histogramData = useMemo(() => {
    return distribution.bin_counts.map((count, i) => {
      const binCenter = (distribution.bin_edges[i] + distribution.bin_edges[i + 1]) / 2;
      return {
        bin: (binCenter * 100).toFixed(1),
        count,
        pnl: (binCenter * positionSize).toFixed(2),
        isPositive: binCenter > 0,
      };
    });
  }, [distribution, positionSize]);

  return (
    <div className="...">
      {/* Title */}
      <h3>Fade This Shock?</h3>
      <p className="text-sm text-gray-500">
        Based on historical data for {shockCategory || 'all'} market shocks
      </p>

      {/* Position Size Input */}
      <div>
        <label>Position Size ($)</label>
        <input
          type="number"
          value={positionSize}
          onChange={(e) => setPositionSize(Number(e.target.value))}
          min={1}
          max={10000}
        />
      </div>

      {/* Horizon Selector */}
      <div>
        {['1h', '6h', '24h'].map(h => (
          <button
            key={h}
            onClick={() => setHorizon(h as '1h' | '6h' | '24h')}
            className={horizon === h ? 'active' : ''}
          >
            {h}
          </button>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Expected P&L" value={`$${expectedPnl.toFixed(2)}`} positive={expectedPnl > 0} />
        <MetricCard label="Win Rate" value={`${(winRate * 100).toFixed(0)}%`} positive={winRate > 0.5} />
        <MetricCard label="Best Case (p90)" value={`$${bestCase.toFixed(2)}`} positive={true} />
        <MetricCard label="Worst Case (p10)" value={`$${worstCase.toFixed(2)}`} positive={worstCase > 0} />
      </div>

      {/* Payoff Distribution Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={histogramData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bin" label={{ value: "Reversion (%)", position: "bottom" }} />
          <YAxis label={{ value: "Count", angle: -90 }} />
          <Tooltip
            formatter={(value: number, name: string, props: any) => [
              `${value} shocks (P&L: $${props.payload.pnl})`,
              'Frequency'
            ]}
          />
          <ReferenceLine x="0.0" stroke="#666" strokeDasharray="3 3" label="Break Even" />
          <Bar dataKey="count">
            {histogramData.map((entry, index) => (
              <Cell key={index} fill={entry.isPositive ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Caveats */}
      <p className="text-xs text-gray-400 mt-4">
        ⚠️ In-sample backtest only. Ignores transaction costs, slippage, and liquidity.
        Small sample size — edge may not persist. Not investment advice.
      </p>
    </div>
  );
}

function MetricCard({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="...">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={positive ? 'text-green-500' : 'text-red-500'}>{value}</div>
    </div>
  );
}
```

### Hour 12–14 — Dashboard Controls Component

Add interactive controls to the main dashboard that filter shocks and recompute displayed stats client-side:

```typescript
// components/DashboardControls.tsx
'use client';

import { useState } from 'react';

interface ControlsProps {
  categories: string[];
  onFilterChange: (filters: {
    theta: number;
    horizon: '1h' | '6h' | '24h';
    category: string;
  }) => void;
}

export default function DashboardControls({ categories, onFilterChange }: ControlsProps) {
  const [theta, setTheta] = useState(0.08);
  const [horizon, setHorizon] = useState<'1h' | '6h' | '24h'>('6h');
  const [category, setCategory] = useState('all');

  const handleThetaChange = (val: number) => {
    setTheta(val);
    onFilterChange({ theta: val, horizon, category });
  };

  return (
    <div className="flex flex-wrap gap-6 items-end">
      {/* Theta Slider */}
      <div>
        <label className="text-sm font-medium">
          Shock Threshold (θ): {(theta * 100).toFixed(0)}pp
        </label>
        <input
          type="range"
          min={0.03}
          max={0.20}
          step={0.01}
          value={theta}
          onChange={(e) => handleThetaChange(Number(e.target.value))}
          className="w-48"
        />
      </div>

      {/* Horizon Picker */}
      <div>
        <label className="text-sm font-medium">Horizon</label>
        <div className="flex gap-1">
          {(['1h', '6h', '24h'] as const).map(h => (
            <button
              key={h}
              onClick={() => { setHorizon(h); onFilterChange({ theta, horizon: h, category }); }}
              className={`px-3 py-1 rounded ${horizon === h ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div>
        <label className="text-sm font-medium">Category</label>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); onFilterChange({ theta, horizon, category: e.target.value }); }}
          className="px-3 py-1 rounded border"
        >
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  );
}
```

**Key UX behavior:** When the user changes θ, the shocks table filters to only show shocks with `abs_delta >= θ`. The stats cards and histogram recompute based on the filtered set. This is all client-side — fetch all shocks once, filter in React state.

### Hour 14–16 — New API Route + Wire Real Data

Add the backtest API route:

```typescript
// app/api/backtest/route.ts
import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('shocktest');

    const stats = await db.collection('shock_results').findOne({ _id: 'aggregate_stats' });

    if (!stats) {
      return NextResponse.json({ error: 'No backtest data yet' }, { status: 404 });
    }

    return NextResponse.json({
      backtest: stats.backtest || null,
      distribution_1h: stats.distribution_1h || null,
      distribution_6h: stats.distribution_6h || null,
      distribution_24h: stats.distribution_24h || null,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch backtest data' }, { status: 500 });
  }
}
```

Start replacing dummy data with real API calls across all components:
```bash
curl http://localhost:3000/api/shocks     # should return shock events
curl http://localhost:3000/api/stats      # should return aggregate stats
curl http://localhost:3000/api/backtest   # should return backtest + distribution data
```

✅ Done when: Trade simulator renders on detail page with real or dummy data. Dashboard controls (θ slider, horizon picker, category filter) dynamically filter the shocks table. `/api/backtest` route returns data.

---

## HOUR 16–20 — INTEGRATION + MVP

**Goal:** Full integration — everything shows real numbers. No dummy data anywhere.

### Hour 16–18 — Wire All Real Data

Pattern for replacing dummy data in every component:
```typescript
const [shocks, setShocks] = useState<Shock[]>([]);
const [stats, setStats] = useState<AggregateStats | null>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  Promise.all([
    fetch('/api/shocks').then(r => r.json()),
    fetch('/api/stats').then(r => r.json()),
  ]).then(([shocksData, statsData]) => {
    setShocks(shocksData);
    setStats(statsData);
    setLoading(false);
  }).catch(err => {
    console.error(err);
    setLoading(false);
  });
}, []);
```

Wire the trade simulator on the detail page:
```typescript
// In /shock/[id]/page.tsx:
// 1. Fetch the shock from /api/shocks (filter client-side by id)
// 2. Fetch backtest data from /api/backtest
// 3. Pass to TradeSimulator component

const [backtestData, setBacktestData] = useState(null);

useEffect(() => {
  fetch('/api/backtest')
    .then(r => r.json())
    .then(data => setBacktestData(data));
}, []);

// In JSX:
{backtestData && (
  <TradeSimulator
    shockDelta={shock.delta}
    shockCategory={shock.category}
    backtest={backtestData.backtest}
    distribution={backtestData.distribution_6h}
  />
)}
```

Integrate DashboardControls into the main page:
```typescript
// In page.tsx:
// 1. Fetch all shocks once
// 2. DashboardControls fires onFilterChange
// 3. Filter shocks client-side: shocks.filter(s => s.abs_delta >= theta && (category === 'all' || s.category === category))
// 4. Recompute displayed stats from filtered set
```

### Hour 18–20 — FindingsBlock + Footer + Deploy

Update FindingsBlock to include backtest win rate:
```typescript
// components/FindingsBlock.tsx
export default function FindingsBlock({ stats }: FindingsProps) {
  if (!stats.reversion_rate_6h) return null;

  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 my-6 rounded">
      <p className="text-lg">
        Across <strong>{stats.total_shocks}</strong> probability shocks in{' '}
        <strong>{stats.total_markets}</strong> markets, we found that{' '}
        <strong>{(stats.reversion_rate_6h * 100).toFixed(0)}%</strong> reverted
        within 6 hours — with a simulated fade strategy producing a{' '}
        <strong>{((stats.backtest?.win_rate_6h ?? 0) * 100).toFixed(0)}%</strong>{' '}
        win rate.
      </p>
    </div>
  );
}
```

Footer:
```
"Powered by Polymarket · Data stored in MongoDB Atlas · Categories by Google Gemini"
```

Deploy:
```bash
cd dashboard
vercel --prod
```

Point GoDaddy domain to Vercel (CNAME to `cname.vercel-dns.com`).

✅ Done when: `shocktest.xyz` loads with real data, trade simulator works on detail pages, controls filter the dashboard.

---

## HOUR 20–24 — POLISH + STRETCH + SUBMISSION

### Hour 20–22 — UI Polish (30 min focused session)

Use Claude Code to:
- Apply a consistent, distinctive color palette via Tailwind config (not default blue)
- Ensure chart labels are readable (font size, contrast, axis labels with units)
- Add smooth transitions on page load (fade-in for cards)
- Make layout responsive (test at mobile width)
- Visual hierarchy: the trade simulator and headline finding should be the most prominent elements
- Loading states and error states for all data-fetching components
- Make the θ slider feel snappy (no lag, immediate visual feedback)

### Hour 22–23 — Film Reel + Demo Prep

Screen-record a 30-second walkthrough:
1. Show the dashboard with controls — drag the θ slider
2. Click a dramatic shock in the table
3. Show the price chart spiking and reverting
4. Show the trade simulator: enter $500, show expected P&L
5. End card: `shocktest.xyz`

Post to Instagram as reel, tag **@yhack.yale**.

Prepare demo flow for judges:
1. Open `shocktest.xyz`
2. Explain the hypothesis in one sentence
3. Adjust θ slider — show shocks appearing/disappearing
4. Click into a compelling shock → show chart + simulator
5. State the headline number
6. Close with caveats

### Hour 23–24 — Final Deploy + Submit

```bash
vercel --prod

# Verify
curl https://shocktest.xyz
curl https://shocktest.xyz/api/shocks
curl https://shocktest.xyz/api/stats
curl https://shocktest.xyz/api/backtest
```

Submit on Devpost (`yhack-2026.devpost.com`):
- Project name: **ShockTest**
- Tagline: **"Do Prediction Markets Overreact? Find the Edge. Size the Trade."**
- Tracks: Prediction Markets, Most Creative Hack, Best UI/UX
- Demo URL: `shocktest.xyz`
- GitHub repo link
- Demo video (reel or longer walkthrough)
- Description from Person 2

---

## New TypeScript Interfaces (add to `lib/types.ts`)

```typescript
export interface BacktestStats {
  win_rate_1h: number | null;
  win_rate_6h: number | null;
  win_rate_24h: number | null;
  avg_pnl_per_dollar_6h: number;
  max_drawdown_6h: number;
  total_trades: number;
  by_category: Record<string, {
    win_rate_6h: number;
    avg_pnl_6h: number;
    sample_size: number;
  }>;
}

export interface DistributionData {
  bin_edges: number[];
  bin_counts: number[];
  percentiles: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  mean: number;
  std: number;
  min: number;
  max: number;
}

export interface BacktestResponse {
  backtest: BacktestStats | null;
  distribution_1h: DistributionData | null;
  distribution_6h: DistributionData | null;
  distribution_24h: DistributionData | null;
}
```

---

## API Routes Summary

| Route | Method | Purpose | Returns |
|-------|--------|---------|---------|
| `/api/shocks` | GET | All detected shocks, sorted by abs_delta desc | `Shock[]` |
| `/api/markets` | GET | List all markets (no series) | `Market[]` |
| `/api/markets?id=X` | GET | Single market with full price series | `Market` with `series` |
| `/api/stats` | GET | Aggregate statistics | `AggregateStats` |
| **`/api/backtest`** | **GET** | **Backtest stats + distribution data** | **`BacktestResponse`** |

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
curl http://localhost:3000/api/backtest
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
| **`app/api/backtest/route.ts`**  | **Returns backtest stats + distribution**    |
| `app/page.tsx`                    | Main dashboard page                          |
| `app/shock/[id]/page.tsx`        | Per-shock detail page + trade simulator      |
| `components/Header.tsx`           | Title bar + subtitle                         |
| `components/StatsCards.tsx`       | 4 summary metric cards                       |
| `components/FindingsBlock.tsx`    | Summary paragraph with real numbers          |
| `components/ShocksTable.tsx`      | Sortable, filterable shocks table            |
| `components/PriceChart.tsx`       | Probability line chart with shock highlight  |
| `components/Histogram.tsx`        | Distribution of post-shock reversion values  |
| `components/CategoryBreakdown.tsx`| Reversion rate per category                  |
| **`components/TradeSimulator.tsx`** | **Position sizing + payoff distribution**  |
| **`components/DashboardControls.tsx`** | **θ slider, horizon picker, category filter** |
| `components/LoadingSpinner.tsx`   | Shared loading spinner                       |
| `components/Footer.tsx`           | Attribution line                             |
