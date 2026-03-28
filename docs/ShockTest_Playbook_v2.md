# ShockTest — Detailed Build Playbook v2
## Hour-by-Hour Instructions for Each Team Member
### YHack Spring 2026 · 24-Hour Build

---

> **How to use this document:** Each person follows their column independently. Steps marked with 🔗 are handoff points where you depend on or unblock someone else. Steps marked with ✅ have a "done" check — verify before moving on. Steps marked with ⚠️ have a fallback if something goes wrong.
>
> **v2 changes:** Restructured Hours 10–24 to pivot from "research dashboard" to "trading signal + decision tool." The fade-strategy backtest is now core (not stretch). A trade simulator component is now required. Configurable controls (θ slider, horizon picker) are now required.

---

## HOURS 0–10 · COMPLETED

> Hours 0–10 are done. Summary of what should exist at this point:

**Person 1 (Data Pipeline) — Done:**
- ✅ GoDaddy domain registered
- ✅ MongoDB Atlas M0 cluster running, connection string shared
- ✅ Polymarket API verified, data shape documented
- ✅ 50+ Polymarket markets with price history in `market_series`
- ✅ 20+ Manifold markets in `market_series`
- ✅ All time series resampled to consistent format (unix seconds, float 0-1)

**Person 2 (Analysis) — Done:**
- ✅ `helpers.py` with `get_db()`, `load_market_series()`, `get_delta()`
- ✅ `shock_detector.py` with `find_shocks()` implemented and tested
- ✅ Shock detection run on all markets → `shock_events` collection populated (≥15 shocks)
- ✅ Top 3-5 shocks manually verified as real market moves (not artifacts)

**Person 3 (Frontend) — Done:**
- ✅ Next.js app scaffolded with TypeScript, Tailwind, Recharts
- ✅ MongoDB connection singleton (`lib/mongodb.ts`)
- ✅ API routes: `/api/shocks`, `/api/markets`, `/api/stats` — reading from MongoDB
- ✅ Skeleton deployed to Vercel
- ✅ ShocksTable component built (with dummy or real data)
- ✅ PriceChart component built (Recharts LineChart with shock window highlight)
- ✅ Per-shock detail page (`/shock/[id]`) built

---

## HOUR 10–16 · CORE TRADING TOOL BUILD (CURRENT PHASE)

This is the critical phase. By Hour 16, the project transforms from "research dashboard" into "trading decision tool."

### Person 1 (Data Pipeline)

**Hour 10–12 · Expand Data + Support Backtest**

- Expand to 100+ total markets if not already there. Fetch more Polymarket or Manifold markets as needed.
- Monitor MongoDB storage in Atlas dashboard (free tier = 512MB).
- Add `fade_pnl` fields to existing shock events — these are numerically identical to the reversion values but stored explicitly for the trade simulator:

```python
# add_fade_pnl.py
"""
For each shock event, add fade_pnl fields.
fade_pnl = reversion value (positive = profit if you faded the shock)
This is a convenience field for the frontend trade simulator.
"""
from pymongo import MongoClient
import os

db = MongoClient(os.environ["MONGODB_URI"])["shocktest"]

shocks = list(db["shock_events"].find({}))
print(f"Adding fade_pnl fields to {len(shocks)} shocks...")

for shock in shocks:
    update = {}
    for h in ["1h", "6h", "24h"]:
        rev = shock.get(f"reversion_{h}")
        update[f"fade_pnl_{h}"] = rev  # same value, different semantic name
    
    db["shock_events"].update_one({"_id": shock["_id"]}, {"$set": update})

print("Done.")
```

**Hour 12–14 · Compute Distribution Data for Trade Simulator**

The trade simulator needs histogram data and percentile statistics. Compute these and add to `shock_results`:

```python
# compute_distribution.py
"""
Compute distribution parameters for the trade simulator.
Stores histogram bins + percentiles in shock_results.
"""
import numpy as np
from pymongo import MongoClient
import os

db = MongoClient(os.environ["MONGODB_URI"])["shocktest"]

shocks = list(db["shock_events"].find({}))

for horizon in ["1h", "6h", "24h"]:
    key = f"reversion_{horizon}"
    values = [s[key] for s in shocks if s.get(key) is not None]
    
    if not values:
        continue
    
    values = np.array(values)
    
    # Histogram bins (for the frontend payoff chart)
    bin_edges = np.linspace(values.min() - 0.01, values.max() + 0.01, 20)
    bin_counts, _ = np.histogram(values, bins=bin_edges)
    
    # Percentiles (for the scenario analysis)
    percentiles = {
        "p10": round(float(np.percentile(values, 10)), 4),
        "p25": round(float(np.percentile(values, 25)), 4),
        "p50": round(float(np.percentile(values, 50)), 4),
        "p75": round(float(np.percentile(values, 75)), 4),
        "p90": round(float(np.percentile(values, 90)), 4),
    }
    
    dist_data = {
        f"distribution_{horizon}": {
            "bin_edges": [round(float(x), 4) for x in bin_edges],
            "bin_counts": [int(x) for x in bin_counts],
            "percentiles": percentiles,
            "mean": round(float(values.mean()), 4),
            "std": round(float(values.std()), 4),
            "min": round(float(values.min()), 4),
            "max": round(float(values.max()), 4),
        }
    }
    
    db["shock_results"].update_one(
        {"_id": "aggregate_stats"},
        {"$set": dist_data},
        upsert=True
    )
    
    print(f"{horizon}: {len(values)} samples, mean={values.mean():.4f}, std={values.std():.4f}")

# Also compute backtest summary stats
all_rev_6h = [s["reversion_6h"] for s in shocks if s.get("reversion_6h") is not None]
if all_rev_6h:
    arr = np.array(all_rev_6h)
    
    # By category
    categories = set(s.get("category") for s in shocks if s.get("category"))
    by_cat = {}
    for cat in categories:
        cat_vals = [s["reversion_6h"] for s in shocks 
                    if s.get("category") == cat and s.get("reversion_6h") is not None]
        if cat_vals:
            cat_arr = np.array(cat_vals)
            by_cat[cat] = {
                "win_rate_6h": round(float(np.mean(cat_arr > 0)), 4),
                "avg_pnl_6h": round(float(cat_arr.mean()), 4),
                "sample_size": len(cat_vals),
            }
    
    backtest = {
        "win_rate_1h": None,
        "win_rate_6h": round(float(np.mean(arr > 0)), 4),
        "win_rate_24h": None,
        "avg_pnl_per_dollar_6h": round(float(arr.mean()), 4),
        "max_drawdown_6h": round(float(arr.min()), 4),
        "total_trades": len(all_rev_6h),
        "by_category": by_cat,
    }
    
    # Fill in 1h and 24h
    for h, key in [("1h", "reversion_1h"), ("24h", "reversion_24h")]:
        vals = [s[key] for s in shocks if s.get(key) is not None]
        if vals:
            backtest[f"win_rate_{h}"] = round(float(np.mean(np.array(vals) > 0)), 4)
    
    db["shock_results"].update_one(
        {"_id": "aggregate_stats"},
        {"$set": {"backtest": backtest}},
        upsert=True
    )
    
    print(f"\nBacktest 6h: win_rate={backtest['win_rate_6h']:.1%}, avg_pnl={backtest['avg_pnl_per_dollar_6h']:.4f}")

print("Distribution + backtest data stored in shock_results.")
```

**Hour 14–16 · Quality Assurance**
- Verify all data is consistent: run `mise run db:status` — all three collections should have data
- Spot-check: query `shock_results` and confirm `backtest` and `distribution_6h` fields exist
- Help Person 3 with any data format issues in the API routes
- 🔗 Ping Person 3 when distribution + backtest data is ready in MongoDB

- ✅ Done when: `shock_results` contains `backtest` object and `distribution_6h` object with real numbers

---

### Person 2 (Analysis)

**Hour 10–12 · Post-Shock Outcomes**

Run `post_shock.py` to compute reversion values for all detected shocks:

```python
# analysis/post_shock.py
import pandas as pd
import numpy as np
from analysis.shock_detector import load_market_series, get_db

def compute_post_shock_outcomes(shock: dict, horizons_hours: list = [1, 6, 24]) -> dict:
    """
    For a detected shock, measure what happens at each horizon.
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
        
        time_diffs = abs(df["t"] - target_time)
        closest_idx = time_diffs.idxmin()
        closest_time = df.loc[closest_idx, "t"]
        
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
    db = get_db()
    shocks = list(db["shock_events"].find({}))
    print(f"Computing post-shock outcomes for {len(shocks)} shocks...")
    
    for i, shock in enumerate(shocks):
        outcomes = compute_post_shock_outcomes(shock)
        if outcomes:
            db["shock_events"].update_one({"_id": shock["_id"]}, {"$set": outcomes})
            rev_6h = outcomes.get("reversion_6h")
            rev_str = f"{rev_6h:+.4f}" if rev_6h is not None else "N/A"
            print(f"  [{i+1}] {shock.get('question', '')[:50]}... reversion_6h={rev_str}")
    
    print("Done.")

if __name__ == "__main__":
    run_all_post_shock_analysis()
```

- ✅ Done when: all shock_events documents have `reversion_1h`, `reversion_6h`, `reversion_24h` fields

**Hour 12–14 · Gemini Categorization + Aggregate Stats**

Run `categorize.py` then `aggregate.py`:

```python
# analysis/categorize.py
import google.generativeai as genai
from pymongo import MongoClient
import time, os

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "your_key_here")
MONGO_URI = os.environ["MONGODB_URI"]

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")
db = MongoClient(MONGO_URI)["shocktest"]

def categorize_market(question: str) -> str:
    prompt = (
        "Classify this prediction market into exactly one category: "
        "politics, sports, crypto, entertainment, science, or other. "
        f"Market: '{question}'. "
        "Respond with only the category name in lowercase, nothing else."
    )
    try:
        response = model.generate_content(prompt)
        category = response.text.strip().lower()
        valid = {"politics", "sports", "crypto", "entertainment", "science", "other"}
        return category if category in valid else "other"
    except Exception as e:
        print(f"  Gemini error: {e}")
        return "other"

def categorize_all_markets():
    markets = list(db["market_series"].find({"category": None}))
    print(f"Categorizing {len(markets)} markets with Gemini...")
    
    for i, market in enumerate(markets):
        question = market["question"]
        category = categorize_market(question)
        
        db["market_series"].update_one({"_id": market["_id"]}, {"$set": {"category": category}})
        db["shock_events"].update_many(
            {"market_id": market["market_id"]},
            {"$set": {"category": category}}
        )
        
        print(f"  [{i+1}/{len(markets)}] {category:15s} | {question[:60]}")
        time.sleep(7)  # stay under 10 RPM limit
    
    pipeline = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}]
    for doc in db["market_series"].aggregate(pipeline):
        print(f"  {doc['_id']}: {doc['count']} markets")

if __name__ == "__main__":
    categorize_all_markets()
```

Then run aggregate stats:

```python
# analysis/aggregate.py
import numpy as np
from pymongo import MongoClient
import os

db = MongoClient(os.environ["MONGODB_URI"])["shocktest"]

def compute_aggregate_stats():
    shocks = list(db["shock_events"].find({}))
    if not shocks:
        print("No shocks found!")
        return
    
    reversions_1h = [s["reversion_1h"] for s in shocks if s.get("reversion_1h") is not None]
    reversions_6h = [s["reversion_6h"] for s in shocks if s.get("reversion_6h") is not None]
    reversions_24h = [s["reversion_24h"] for s in shocks if s.get("reversion_24h") is not None]
    
    stats = {
        "_id": "aggregate_stats",
        "total_shocks": len(shocks),
        "total_markets": len(set(s["market_id"] for s in shocks)),
        
        "reversion_rate_1h": round(np.mean([r > 0 for r in reversions_1h]), 4) if reversions_1h else None,
        "mean_reversion_1h": round(float(np.mean(reversions_1h)), 4) if reversions_1h else None,
        "std_reversion_1h": round(float(np.std(reversions_1h)), 4) if reversions_1h else None,
        "sample_size_1h": len(reversions_1h),
        
        "reversion_rate_6h": round(np.mean([r > 0 for r in reversions_6h]), 4) if reversions_6h else None,
        "mean_reversion_6h": round(float(np.mean(reversions_6h)), 4) if reversions_6h else None,
        "std_reversion_6h": round(float(np.std(reversions_6h)), 4) if reversions_6h else None,
        "sample_size_6h": len(reversions_6h),
        
        "reversion_rate_24h": round(np.mean([r > 0 for r in reversions_24h]), 4) if reversions_24h else None,
        "mean_reversion_24h": round(float(np.mean(reversions_24h)), 4) if reversions_24h else None,
        "sample_size_24h": len(reversions_24h),
        
        "by_category": {}
    }
    
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
    
    db["shock_results"].update_one({"_id": "aggregate_stats"}, {"$set": stats}, upsert=True)
    
    print(f"\n{'='*60}")
    print(f"SHOCKTEST RESULTS")
    print(f"{'='*60}")
    print(f"Total shocks: {stats['total_shocks']} across {stats['total_markets']} markets")
    if stats['reversion_rate_6h']:
        print(f"6-Hour Reversion Rate: {stats['reversion_rate_6h']:.1%}")
        print(f"Mean 6h Reversion: {stats['mean_reversion_6h']:.2%}")
    print(f"Sample size: {stats['sample_size_6h']}")
    print(f"\nBy category:")
    for cat, data in stats["by_category"].items():
        rate = data.get("reversion_rate_6h")
        if rate:
            print(f"  {cat}: {data['count']} shocks, 6h reversion = {rate:.1%}")
    
    return stats

if __name__ == "__main__":
    compute_aggregate_stats()
```

- 🔗 Ping Person 1 to run `compute_distribution.py` after this completes (or run it yourself)
- 🔗 Ping Person 3: `shock_results` now has aggregate stats — `/api/stats` returns real data
- ✅ Done when: `shock_results` has `aggregate_stats` doc with real numbers, all shocks have categories

**Hour 14–16 · Write Findings + Validate**

Validate the results:
```python
# Quick validation checklist:
# 1. Is reversion_rate_6h between 40-70%? (Outside this range → likely a bug)
# 2. Is mean_reversion_6h between 0.005 and 0.10? (Reasonable range)
# 3. Does each category have ≥5 shocks? (If not, consider merging small categories into "other")
# 4. Are there any NaN/null values where there shouldn't be?
# 5. Spot-check: pick 3 shocks, manually verify their reversion values against the price series
```

Write the findings paragraph (share with Person 3):
```
FINDINGS_TEMPLATE = """
Across {total_shocks} probability shocks detected in {total_markets} Polymarket and 
Manifold markets, {reversion_rate_6h:.0%} showed mean reversion within 6 hours — 
with an average reversion of {mean_reversion_6h:.1%} percentage points. A simulated 
fade-the-shock strategy produced a {backtest_win_rate:.0%} win rate with an expected 
return of {backtest_avg_pnl:.2%} per dollar risked. {category_insight}
"""

# Fill in category_insight based on actual numbers, e.g.:
# "Political markets reverted at 72% vs. 60% for crypto — suggesting political shocks
#  are more often overreactions to headlines, while crypto moves more likely reflect
#  genuine information."
```

- 🔗 Share findings text with Person 3 via group chat
- ✅ Done when: findings paragraph written with real numbers, results manually validated

---

### Person 3 (Frontend)

**Hour 10–12 · Trade Simulator Component**

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
        bin: (binCenter * 100).toFixed(1),  // display as percentage
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

**Hour 12–14 · Configurable Dashboard Controls**

Add interactive controls to the main dashboard page that filter shocks and recompute displayed stats client-side:

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

**Hour 14–16 · New API Route + Wire Real Data**

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
- Check each API route: `curl http://localhost:3000/api/shocks`, `/api/stats`, `/api/backtest`
- Swap `DUMMY_SHOCKS` → `fetch('/api/shocks')`
- Swap `DUMMY_STATS` → `fetch('/api/stats')`
- Wire trade simulator to `/api/backtest` data

- ✅ Done when: Trade simulator renders on detail page with real or dummy data. Dashboard controls (θ slider, horizon picker, category filter) dynamically filter the shocks table. `/api/backtest` route returns data.

---

## HOUR 16–20 · INTEGRATION + MVP

### Person 1 (Data Pipeline)

**Goal:** MVP data is complete. Write README. Support Person 3.

- Verify all MongoDB collections are populated and consistent:
```bash
mise run db:status     # check collection counts
mise run api:test      # check API routes return data
```
- Write `README.md`:
```markdown
# ShockTest — Do Prediction Markets Overreact?

## What It Does
ShockTest is a trading signal and decision tool for Polymarket. It detects large 
probability shocks (overreactions), measures whether they systematically revert, 
and gives traders an interactive simulator to size fade-the-shock positions based 
on historical edge statistics.

## The Finding
[Fill with real numbers from aggregate_stats]

## How to Use It
1. Browse detected shocks in the table — filter by category, adjust the shock threshold
2. Click a shock to see the full probability chart with the shock highlighted
3. Use the Trade Simulator to input a position size and see expected P&L, win rate, 
   and the historical distribution of outcomes
4. Adjust the time horizon (1h/6h/24h) to see how the edge changes over time

## Tech Stack
- **Data**: Polymarket Gamma API + Manifold Markets API
- **Storage**: MongoDB Atlas (free M0 cluster)
- **Analysis**: Python (pandas, numpy) — shock detection + fade-strategy backtest
- **Categorization**: Google Gemini 2.5 Flash
- **Frontend**: Next.js 14 + Recharts + Tailwind CSS
- **Deployment**: Vercel + GoDaddy custom domain

## Methodology
[Paste from Plan Section 3]

## Caveats
- In-sample backtest only — no out-of-sample validation
- Ignores transaction costs, slippage, and liquidity
- Small sample size — edge may not persist
- Not investment advice

## Team
[Names]

## Built at YHack Spring 2026
```

- Help Person 3 debug any data format issues

---

### Person 2 (Analysis)

**Goal:** Validate all results. Finalize findings. Help Person 3 interpret data.

**Hour 16–18 · Final Validation**
```python
# validation_checklist.py
"""Run all validation checks before declaring MVP."""
from pymongo import MongoClient
import os

db = MongoClient(os.environ["MONGODB_URI"])["shocktest"]

# 1. Check collection counts
for col in ["market_series", "shock_events", "shock_results"]:
    count = db[col].count_documents({})
    print(f"{col}: {count} docs")

# 2. Check aggregate stats exist
stats = db["shock_results"].find_one({"_id": "aggregate_stats"})
assert stats is not None, "No aggregate stats!"
print(f"\nReversion rate 6h: {stats.get('reversion_rate_6h')}")
print(f"Mean reversion 6h: {stats.get('mean_reversion_6h')}")
print(f"Sample size 6h: {stats.get('sample_size_6h')}")

# 3. Check backtest data exists
assert "backtest" in stats, "No backtest data!"
print(f"\nBacktest win rate 6h: {stats['backtest'].get('win_rate_6h')}")
print(f"Backtest avg P&L 6h: {stats['backtest'].get('avg_pnl_per_dollar_6h')}")

# 4. Check distribution data exists
assert "distribution_6h" in stats, "No distribution data!"
print(f"\nDistribution bins: {len(stats['distribution_6h']['bin_counts'])}")

# 5. Check categories are populated
uncategorized = db["shock_events"].count_documents({"category": None})
print(f"\nUncategorized shocks: {uncategorized}")

# 6. Spot-check 3 random shocks
import random
shocks = list(db["shock_events"].find({}))
for shock in random.sample(shocks, min(3, len(shocks))):
    print(f"\n  {shock['question'][:50]}")
    print(f"  delta={shock['delta']:+.4f}, rev_6h={shock.get('reversion_6h', 'N/A')}, cat={shock.get('category', 'N/A')}")

print("\n✅ All checks passed!" if uncategorized == 0 else "\n⚠️ Some issues remain")
```

**Hour 18–20 · Finalize Findings + Devpost**

Write the final findings paragraph with actual numbers (share with Person 3):
```
FINDINGS = """
Across {total_shocks} probability shocks detected in {total_markets} Polymarket and
Manifold markets, {reversion_rate_6h:.0%} showed mean reversion within 6 hours. 
A simulated fade-the-shock strategy produced a {win_rate:.0%} win rate with 
{avg_pnl:.2%} expected return per dollar risked. {category_insight}
"""
```

Draft the Devpost description:
```
## What it does
ShockTest detects overreactions in Polymarket prediction markets and turns them 
into trading signals. When a market's probability jumps suddenly, our tool measures 
whether that shock historically reverts — and lets you simulate what happens if you 
take the opposite position.

## How we built it
Python backend fetches 100+ markets from Polymarket's Gamma API and Manifold, stores 
price histories in MongoDB Atlas, detects probability shocks via a configurable 
threshold scanner, and computes post-shock outcomes at 1h/6h/24h horizons. Google 
Gemini auto-categorizes markets. The Next.js dashboard deployed on Vercel features 
interactive controls, per-shock detail pages with probability charts, and a trade 
simulator that projects P&L based on historical backtest data.

## What we found
[Insert headline result with real numbers]

## Challenges
- Normalizing time series across two different API formats (Polymarket uses 2-min candles, Manifold uses per-bet timestamps)
- Deduplicating overlapping shock detections without losing real events
- Balancing statistical rigor with hackathon time constraints

## What we learned
- Prediction markets do show measurable mean reversion after large shocks
- The effect varies significantly by market category
- Building a quant-style backtest from scratch in 24 hours is very doable with the right data pipeline

## Built with
Polymarket Gamma API, Manifold Markets API, MongoDB Atlas, Google Gemini 2.5 Flash, 
Python, pandas, NumPy, Next.js, TypeScript, Recharts, Tailwind CSS, Vercel
```

- 🔗 Share findings text + Devpost draft with team

---

### Person 3 (Frontend)

**Goal:** Full integration — everything shows real numbers. No dummy data anywhere.

**Hour 16–18 · Wire All Real Data**

Pattern for replacing dummy data in every component:
```typescript
// In page.tsx or any component that needs data:
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

**Hour 18–20 · FindingsBlock + Footer + Deploy**

Add the FindingsBlock component with Person 2's findings text:
```typescript
// components/FindingsBlock.tsx
interface FindingsProps {
  stats: AggregateStats;
}

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

Add Footer with attribution:
```
"Powered by Polymarket · Data stored in MongoDB Atlas · Categories by Google Gemini"
```

Deploy:
```bash
cd dashboard
vercel --prod
```

Point GoDaddy domain to Vercel (CNAME to `cname.vercel-dns.com`).

- ✅ Done when: `shocktest.xyz` loads with real data, trade simulator works on detail pages, controls filter the dashboard

---

## HOUR 20–24 · POLISH + STRETCH + SUBMISSION

### Person 1

- Polish README with final numbers
- Stretch: add transaction cost assumptions to backtest (e.g., deduct 1-2% slippage per trade, report adjusted EV)
- Help with Devpost submission

### Person 2

- Stretch: statistical significance — basic confidence intervals on reversion rate
- Stretch: identify "recent shocks" (last 24-48h) and flag them as potentially actionable in the data
- Finalize Devpost description with final numbers

### Person 3

**Hour 20–22 · UI Polish (30 min focused session)**

Use Claude Code to:
- Apply a consistent, distinctive color palette via Tailwind config (not default blue)
- Ensure chart labels are readable (font size, contrast, axis labels with units)
- Add smooth transitions on page load (fade-in for cards)
- Make layout responsive (test at mobile width)
- Visual hierarchy: the trade simulator and headline finding should be the most prominent elements
- Loading states and error states for all data-fetching components
- Make the θ slider feel snappy (no lag, immediate visual feedback)

**Hour 22–23 · Film Reel + Demo Prep**

Screen-record a 30-second walkthrough:
1. Show the dashboard with controls — drag the θ slider
2. Click a dramatic shock in the table
3. Show the price chart spiking and reverting
4. Show the trade simulator: enter $500, show expected P&L
5. End card: `shocktest.xyz`

Post to Instagram as reel, tag @yhack.yale.

Prepare demo flow for judges:
1. Open `shocktest.xyz`
2. Explain the hypothesis in one sentence
3. Adjust θ slider — show shocks appearing/disappearing
4. Click into a compelling shock → show chart + simulator
5. State the headline number
6. Close with caveats

**Hour 23–24 · Final Deploy + Submit**

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

## Updated TypeScript Interfaces

Add these to `dashboard/lib/types.ts`:

```typescript
// Existing interfaces stay the same. Add:

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

## Updated API Routes Summary

| Route | Method | Purpose | Returns |
|-------|--------|---------|---------|
| `/api/shocks` | GET | All detected shocks, sorted by abs_delta desc | `Shock[]` |
| `/api/markets` | GET | List all markets (no series) | `Market[]` |
| `/api/markets?id=X` | GET | Single market with full price series | `Market` with `series` |
| `/api/stats` | GET | Aggregate statistics | `AggregateStats` |
| `/api/backtest` | GET | **NEW** — Backtest stats + distribution data | `BacktestResponse` |

---

## Updated Handoff Checklist

| Time | From | To | What |
|------|------|----|------|
| ~~Min 20~~ | ~~Person 1~~ | ~~All~~ | ~~MongoDB connection string~~ ✅ |
| ~~Min 90~~ | ~~Person 1~~ | ~~Person 2, 3~~ | ~~data_shape.py~~ ✅ |
| ~~Hour 2~~ | ~~Person 1~~ | ~~All~~ | ~~Polymarket primary decision~~ ✅ |
| ~~Hour 4~~ | ~~Person 1~~ | ~~Person 2~~ | ~~≥20 markets in MongoDB~~ ✅ |
| ~~Hour 6~~ | ~~Person 2~~ | ~~Person 3~~ | ~~shock_events populated~~ ✅ |
| Hour 14 | Person 2 | Person 3 | Aggregate stats + categories in MongoDB → `/api/stats` returns real data |
| **Hour 14** | **Person 1** | **Person 3** | **Backtest + distribution data in MongoDB → `/api/backtest` returns real data** |
| Hour 18 | Person 2 | Person 3 | Findings paragraph text for dashboard |
| Hour 22 | Person 2 | Person 3 | Devpost project description draft |
