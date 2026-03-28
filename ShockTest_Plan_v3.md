# ShockTest
## *Do Prediction Markets Overreact? Find the Edge. Size the Trade.*
### YHack Spring 2026 · Prediction Markets Track · 24-Hour Build

---

> **TL;DR**
> ShockTest is a **trading signal and analysis tool** for Polymarket. It pulls real market data, detects large probability shocks ("overreactions"), measures whether they systematically mean-revert, and gives traders an interactive simulator to size fade-the-shock positions with historical edge statistics. The result is a quant-grade analytics + trading decision tool backed by **MongoDB Atlas**, with market categorization powered by **Google Gemini** — built in 24 hours by a team of three.

---

## 1. The Hypothesis (The Alpha)

Prediction markets are often described as efficient aggregators of information — but they can still overreact to headlines, herd during high-attention moments, or temporarily misprice due to low liquidity.

We test a single, falsifiable question:

> **H₀ (null):** After a large probability shock, future changes are random / symmetric.
> **H₁ (alt):** After a large shock, probabilities systematically mean-revert (A) or continue trending (B).

We quantify which is more common, how strong the effect is, and whether it differs by market category (politics vs. sports vs. crypto). Then we turn that finding into a **trading tool** — letting users explore the edge interactively and simulate positions before trading.

---

## 2. What We Build

### A. Shock Detection Engine

Scans all tracked Polymarket + Manifold markets for large, fast probability moves using a configurable threshold. Each detected shock is logged with its market name, timestamp window, probability before/after, and delta. Users can **dynamically adjust the shock threshold (θ) and time horizon** to explore different definitions of "overreaction."

### B. Post-Shock Analysis & Backtest

For each shock, measures what happens at horizons h ∈ {1h, 6h, 24h}. Computes reversion amount, continuation amount, and aggregates results across all shocks:

- % of shocks that revert vs. continue (the **edge**)
- Mean reversion magnitude and standard deviation
- Histogram of post-shock probability changes
- Breakdown by market category — categories assigned automatically via **Google Gemini** from market titles
- **Fade strategy backtest**: simulates taking the opposite position after each shock, reports win rate, average P&L, and expected value

### C. Interactive Trade Simulator (Core — Not Stretch)

The key differentiator from a static dashboard. For any detected shock, the user can:

1. **Select a shock** from the table (or view a currently-active/recent one)
2. **Set position size** (e.g., $100, $500) and choose a time horizon (1h, 6h, 24h)
3. **See dynamic outputs**:
   - Expected P&L based on historical reversion rate for that shock's category and magnitude
   - Payoff distribution chart: x-axis = post-shock move, y-axis = P&L, overlaid with the historical distribution of outcomes
   - Win rate, expected value, max drawdown — all derived from real backtest data
   - Scenario analysis: "If this shock reverts to mean, you make $X. If it continues, you lose $Y."
4. **Compare across horizons**: side-by-side expected outcomes at 1h vs. 6h vs. 24h

This turns our statistical finding into a tool that **helps a trader make a decision before placing a trade**.

### D. Interactive Dashboard

A clean, demo-ready Next.js web app deployed on Vercel showing:

- **Configurable controls**: shock threshold slider (θ), horizon picker, category filter — all dynamically refilter the data
- Top Shocks table — sortable by size, category, time, reversion outcome
- Per-shock detail page — probability chart with shock window highlighted + trade simulator panel
- Aggregate histogram — distribution of post-shock moves
- Summary stats panel — reversion rate, mean magnitude, sample size, edge statistics
- Category breakdown — reversion rates by market type

### E. Stretch: Advanced Features

Only after MVP (A–D) is fully working:

- **Live shock alerts**: flag shocks that happened in the last 24h as "potentially actionable"
- **Multi-market portfolio view**: combine multiple fade positions into a single payoff graph
- **Correlation analysis**: do shocks in one market predict shocks in related markets?

---

## 3. Methodology

### Shock Definition

A shock occurs when the absolute change in implied probability exceeds a threshold within a time window:

```
|p(t₂) − p(t₁)| ≥ θ   where Δt = t₂ − t₁ ≤ T
```

> **Default Parameters (user-configurable in the dashboard)**
> θ = 0.08 (8 percentage point move) — adjustable via slider from 0.03 to 0.20
> T = 1 hour (or shortest available resolution) — adjustable via dropdown

### Post-Shock Measurement

For each detected shock at time t₂, record:

```
shock_size  = p(t₂) − p(t₁)
post_move   = p(t₂ + h) − p(t₂)    for h ∈ {1h, 6h, 24h}
reversion   = −sign(shock_size) × post_move
```

Positive reversion = price moved back toward pre-shock level. Negative = continued in shock direction.

### Fade Strategy Backtest

For each shock, simulate the following trade:

```
Entry:    Buy opposite direction at p(t₂) — i.e., if shock was UP, buy NO; if DOWN, buy YES
Exit:     Close at p(t₂ + h) for horizon h
P&L:      position_size × reversion (positive = profit, negative = loss)
```

Report per-category and overall:
- Win rate (% of trades with positive P&L)
- Average P&L per $1 risked
- Expected value per trade
- Max drawdown in the sample

**Important caveats** (displayed in the tool):
- In-sample backtest only — no out-of-sample validation
- Ignores transaction costs, slippage, and liquidity constraints
- Small sample size — edge may not persist
- Not investment advice — exploratory analysis tool

### Trade Simulator Math

For a user-specified position size $S on a shock with magnitude |δ| in category C:

```
Expected P&L     = S × mean_reversion(C, h)
Win Probability   = reversion_rate(C, h)
Best Case P&L     = S × max_reversion(C, h)
Worst Case P&L    = S × min_reversion(C, h)  (negative = loss)
```

Where the distribution parameters come from the historical backtest for that category and horizon.

### Aggregation Metrics

| Metric | Definition |
|--------|------------|
| Reversion Rate | % of shocks where reversion > 0 |
| Mean Reversion | Average reversion magnitude across all shocks |
| Expected Value | Mean P&L per $1 risked in fade strategy |
| Effect by Category | Reversion rate split by politics / sports / crypto |
| Sample Size | Number of valid shocks per horizon |

---

## 4. How This Maps to Track Requirements

| Track Requirement | How ShockTest Delivers |
|-------------------|----------------------|
| "Use real or realistic Polymarket market data" | Primary data source is Polymarket Gamma API (2-min resolution price history), supplemented by Manifold |
| "Allow a user to input positions, strategies, or parameters and see outputs update dynamically" | θ slider, horizon picker, category filter, position size input → all dynamically update charts and P&L projections |
| "Produce concrete analytical or visual outputs" | Payoff distribution charts, P&L scenarios, shock timeline charts, aggregate histograms, category breakdown tables |
| "Be grounded in real trading use cases" | Fade-the-shock is a real mean-reversion strategy; the tool helps a trader decide whether to take the position and at what size |
| "Quality of insight and correctness of modeling" | Falsifiable hypothesis, transparent methodology, explicit caveats about in-sample bias and transaction costs |
| "Strength of visualization and UX" | Interactive controls, per-shock detail pages with trade simulator, responsive Tailwind + Recharts design |
| "Technical depth and execution" | Multi-source data pipeline, configurable event detection algorithm, LLM-based categorization, full-stack deployment |
| "Creativity and originality" | Novel approach: treating prediction market overreactions as a systematic signal, building a tool to evaluate the edge |

---

## 5. Technical Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Data | `polymarket-apis` + `requests` + `pandas` | Fetch & store market time series from Polymarket (primary) and Manifold (supplemental) |
| Storage | **MongoDB Atlas** (free M0 cluster) | Cloud database for market time series, shock events, backtest results, and aggregate stats |
| Analysis | `pandas` + `numpy` | Shock detection, post-shock outcomes, fade strategy backtest |
| Categorization | **Google Gemini 2.5 Flash** (free tier) | Auto-classify markets into politics / sports / crypto / other from titles |
| Frontend | **Next.js** (App Router) + **Recharts** + **Tailwind CSS** | Interactive dashboard with trade simulator, deployed on Vercel |
| Domain | **GoDaddy Registry** (free via MLH) | Custom domain for deployed app |

### Architecture: Python Backend → MongoDB → Next.js Frontend

Persons 1 & 2 work in Python — fetching data, detecting shocks, running backtest, writing results to MongoDB. Person 3 builds a Next.js app that reads from MongoDB via API routes and renders the interactive dashboard + trade simulator. Frontend and backend are fully decoupled.

---

## 6. 24-Hour Team Split (3 People)

| Hours | Person 1 (Data) | Person 2 (Analysis) | Person 3 (Frontend) |
|-------|----------------|---------------------|---------------------|
| 0–2 | GoDaddy domain, MongoDB Atlas setup, verify Polymarket API | Help verify data shape, plan metrics | Scaffold Next.js, install deps, deploy skeleton to Vercel |
| 2–6 | Fetch 50+ Polymarket markets → MongoDB. Pull Manifold markets. | Write delta helpers, start shock detector | Build shocks table + API routes with dummy data |
| 6–10 | Resample/validate data quality, expand market count | Run shock detection at scale, verify shocks | Build price chart component, per-shock detail page |
| **10–16** | **Expand to 100+ markets. Compute backtest results (fade P&L per shock). Support Person 2/3.** | **Post-shock outcomes + Gemini categorization + aggregate stats + backtest statistics (win rate, EV, distribution params). Write findings text.** | **Build trade simulator component + configurable controls (θ slider, horizon picker). Wire real data into all components.** |
| 16–20 | MVP complete — write README, support bugs | Validate results, refine findings text, help Person 3 with data interpretation | Wire trade simulator to real backtest data. Full integration pass. Deploy to Vercel. |
| 20–24 | Stretch features or README/Devpost | Stretch: category breakdown analysis, Devpost description | Polish UI for Best UI/UX. Film reel. Final deploy + submission. |

---

## 7. Hour-by-Hour Detail (Hours 10–24)

### Hours 10–16 · Core Trading Tool Build (CURRENT PHASE)

**Person 1 (Data Pipeline)**
- Expand to 100+ markets total across Polymarket + Manifold
- For each shock event already in MongoDB, compute and store the fade-strategy P&L:
  - `fade_pnl_1h`, `fade_pnl_6h`, `fade_pnl_24h` (same as reversion values, but framed as P&L per $1 position)
- Store distribution parameters in `shock_results`: min/max/percentiles of reversion by category
- Monitor MongoDB storage (free tier = 512MB)

**Person 2 (Analysis)**
- Compute post-shock outcomes at 1h/6h/24h for all shocks → update `shock_events` in MongoDB
- Run Gemini categorization on all markets → update `category` field in `market_series` and `shock_events`
- Compute aggregate stats → store in `shock_results`:
  - Overall: reversion rates, means, std devs, sample sizes per horizon
  - By category: same breakdown per category
  - **Backtest stats**: win rate, average P&L, expected value per $1, max drawdown — overall and by category
  - **Distribution data**: histogram bin edges + counts for the post-shock move distribution (for the frontend payoff chart)
- Write the findings paragraph with real numbers
- Validate: are results sensible? Is reversion rate between 40–70%? Are sample sizes per category ≥5?

**Person 3 (Frontend)**
- Build the **Trade Simulator** component:
  - Position size input ($)
  - Horizon selector (1h / 6h / 24h)
  - Output: expected P&L, win rate, best/worst case
  - Payoff distribution chart (Recharts BarChart showing historical outcome distribution with user's position overlaid)
- Build **configurable controls** for the main dashboard:
  - θ (shock threshold) slider: 0.03–0.20, default 0.08
  - Horizon picker: 1h / 6h / 24h
  - Category filter: all / politics / sports / crypto / other
  - These filter the shocks table and recompute displayed stats client-side
- Start wiring real data: check `/api/shocks`, `/api/stats`, `/api/markets` — replace dummy data as it becomes available
- New API route: `/api/backtest` — returns backtest stats and distribution data from `shock_results`

### Hours 16–20 · Integration + MVP

**Person 1**
- MVP data complete — all markets fetched, all shocks computed, backtest stored
- Write `README.md` with hypothesis, methodology, results, tech stack
- Support Person 3 with data format issues

**Person 2**
- Validate all results manually — spot-check 5 shocks, confirm reversion values make sense
- Refine findings text with final numbers
- Write Devpost project description

**Person 3**
- Full integration: every component reads from real API routes, no dummy data
- Trade simulator wired to real backtest distribution data
- Configurable controls dynamically filter the data
- FindingsBlock component displays Person 2's findings text with injected numbers
- Deploy to Vercel, point GoDaddy domain
- Test: all pages load, all charts render, simulator produces sensible outputs

### Hours 20–24 · Polish + Stretch + Submission

**Person 1**
- Stretch: expand backtest with transaction cost assumptions (e.g., 1% slippage deduction)
- Help with README and Devpost

**Person 2**
- Stretch: statistical significance test on category differences
- Stretch: "recent shocks" view — flag shocks from last 24–48h as potentially actionable
- Finalize Devpost description

**Person 3**
- **30-min UI polish pass**: consistent color palette, readable chart labels, smooth transitions, responsive layout, visual hierarchy (headline finding = most prominent)
- **Film 30-sec reel**: show a dramatic shock → click into it → show trade simulator output → end with URL
- Final `vercel --prod` deploy
- Submit on Devpost: select Prediction Markets, Most Creative Hack, Best UI/UX

---

## 8. Demo Script (3 Minutes)

> **Opening Hook (30 sec)**
> *"Prediction markets are supposed to be efficient — but what if they consistently overreact to breaking news? We built a tool that detects overreactions in Polymarket data and tells you exactly what the historical edge looks like if you fade them. Think of it as a quant signal desk for prediction markets."*
>
> **Show the Signal (45 sec)**
> Show the dashboard with configurable controls. Adjust the θ slider to show how many shocks appear at different thresholds. Click into one compelling example — a political market that jumped 15pp in one hour. Show the probability chart with the shock highlighted in red.
>
> **The Edge (60 sec)**
> Show the aggregate stats and histogram. State the headline: *"In our sample of X shocks across Y Polymarket markets, Z% reverted within 6 hours. Political markets reverted at A%, crypto at B%."* Then show the trade simulator: *"If you had faded this shock with a $100 position, your expected P&L based on historical data would be $X, with a Y% win rate."* Show the payoff distribution chart.
>
> **Why It Matters (45 sec)**
> *"This isn't a black-box trading bot — it's a decision support tool. It shows you the edge, lets you size the position, and gives you the historical distribution so you can make an informed decision. All data is live from Polymarket's API, stored in MongoDB Atlas, categories tagged by Gemini, and the app is live at shocktest.xyz."*

---

## 9. Resume & Interview Talking Points

| What You Did | How You Say It |
|-------------|----------------|
| Shock detection | Implemented a configurable event detection algorithm on probability time series from Polymarket, analogous to volatility spike detection in equity markets |
| Post-shock analysis + backtest | Designed and ran a quantitative mean-reversion study across 100+ prediction markets, then built a fade-strategy backtest reporting win rate, EV, and drawdown |
| Trade simulator | Built an interactive position-sizing tool that uses historical reversion distributions to project expected P&L, win rate, and scenario outcomes for user-specified trades |
| Category breakdown | Used LLM-based classification (Gemini) to auto-tag market categories, then identified differential reversion patterns suggesting behavioral vs. informational drivers |
| Full stack delivery | Shipped a production trading tool (Next.js + Vercel) integrating Polymarket's API, MongoDB Atlas, Gemini, interactive data visualization, and a trade simulator — in 24 hours |

> **Interview angle:** *"I built a trading signal and decision tool for prediction markets. We found that X% of large Polymarket probability shocks reversed within 6 hours. We then built an interactive simulator where a trader can input a position size and see the expected P&L distribution based on historical data — broken down by market category. It's a research finding turned into a usable trading tool."*

---

## 10. Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Polymarket API rate-limited or sparse | Low | Gamma API is public/read-only. Cache in MongoDB. Fall back to Manifold as primary if needed. |
| Not enough shocks in data | Low-Medium | Lower θ to 0.05; combine both sources; use all available history |
| Analysis produces null result (no reversion) | Low | A null result is still valid — "markets are efficient" is a legitimate conclusion; simulator still works, just shows ~50/50 edge |
| Trade simulator feels simplistic | Medium | The simplicity IS the point for a hackathon — clear assumptions, transparent math, explicit caveats. Judges want correctness > complexity. |
| Dashboard not finished in time | Low | Person 3 uses Claude Code heavily. If blocked, the core value is the analysis + backtest — a simpler UI still wins on quant merit. |
| Team blocked on data shape | Low | Persons 2 and 3 can work with mock data while Person 1 fixes pipeline |

---

## 11. Scope Guardrails — What NOT to Build

> **Do not build these before MVP (A–D) is fully working:**
> - ML-based shock prediction (not better than simple stat, adds complexity without insight)
> - Real-time live WebSocket feeds (adds infra complexity, no demo benefit)
> - Connecting to a wallet or executing real trades (out of scope, liability risk)
> - Calibration analysis or Bayesian updating (save for post-hackathon)
> - Multi-market portfolio optimizer (stretch at best)

---

## 12. Prize Strategy

| Track | Prize | What We Do |
|-------|-------|-----------|
| **Prediction Markets** (Polymarket) | $2,000 / $1,000 / $500 | Polymarket Gamma API as primary data source. Trading tool with interactive simulator directly addresses track brief. |
| **Grand Prize** (YHack) | $4,000 / $2,000 / $1,000 | Automatic eligibility |
| **MongoDB Atlas** (MLH) | M5Stack IoT Kit per member | Free M0 cluster for all data storage |
| **Google Gemini** (MLH) | Google Swag Kit per member | Gemini 2.5 Flash auto-categorizes markets |
| **GoDaddy Registry** (MLH) | ~$50 gift card | `shocktest.xyz` via `mlh.link/godaddyregistry` |
| **Most Creative Hack** (YHack) | $100 | Quant research + trading tool at a hackathon is inherently unusual |
| **Best UI/UX** (YHack) | $100 | Interactive simulator + configurable controls = strong UX story |
| **Most Viral Post** (@YHack) | $100 | 30-sec reel of dramatic shock + trade simulator |

**Total exposure: up to $6,350 + hardware + swag** across 8 categories.

---

## 13. MongoDB Schema Additions

The existing schema stays the same. Add these fields:

**`shock_events` collection — new fields per shock:**
```
fade_pnl_1h: float | null    // P&L per $1 if you faded this shock (= reversion value)
fade_pnl_6h: float | null
fade_pnl_24h: float | null
```

**`shock_results` collection — new fields in aggregate_stats:**
```
backtest: {
  win_rate_1h: float,
  win_rate_6h: float,
  win_rate_24h: float,
  avg_pnl_per_dollar_6h: float,
  max_drawdown_6h: float,
  total_trades: int,
  by_category: {
    "politics": { win_rate_6h, avg_pnl_6h, sample_size },
    "crypto": { ... },
    ...
  }
},
distribution_6h: {
  bin_edges: float[],      // histogram bin boundaries
  bin_counts: int[],       // count per bin
  percentiles: { p10, p25, p50, p75, p90 }
}
```

**New API route: `GET /api/backtest`**
Returns the backtest and distribution data from `shock_results` for the trade simulator.
