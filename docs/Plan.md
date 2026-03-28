# ShockTest
## *Do Prediction Markets Overreact? Find the Edge. Size the Trade.*
### YHack Spring 2026 · Prediction Markets Track · 24-Hour Build

---

> **TL;DR**
> ShockTest is a **live trading signal system** for Polymarket. A Python monitor polls markets every 2 minutes, detects probability shocks, and uses **Google Gemini** to analyze each shock in real-time — explaining what likely caused it and whether it's an overreaction. Traders see a **P&L heatmap** (inspired by optionsprofitcalculator.com), interactive payoff curves, scenario analysis, and a backtest-powered trade simulator. The result is a complete workflow: **Detect → Analyze → Visualize → Trade** — backed by **MongoDB Atlas**, built in 24 hours by a team of three.

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

### C. Interactive Trading Tools (Core — The Demo Centerpiece)

Each shock's detail page provides a full suite of trading decision tools:

1. **Payoff Curve**: Interactive payoff diagram showing P&L at every possible resolution outcome (0%–100%). Displays current market price, break-even point, and historical mean-reversion target as reference lines. This is the prediction market equivalent of an options payoff calculator — directly inspired by [optionsprofitcalculator.com](https://www.optionsprofitcalculator.com/) referenced in the track brief.

2. **Scenario Analysis Panel**: Three interactive sliders — "What if probability moves to ___?", "What if resolution is in ___ days?", "Position size $___." Outputs update dynamically: P&L at target, adjusted win rate (accounting for time decay), adjusted EV, and max loss. This directly addresses the brief's call for "scenario analysis tools that show how a position performs if an event resolves sooner vs later."

3. **Trade Simulator**: Position size input → expected P&L, win rate, best/worst case — all derived from real backtest data, broken down by category. Payoff distribution histogram (green = reversion profit, red = continuation loss) overlaid with the user's position size.

4. **P&L Timeline**: Line chart showing how a fade position's P&L evolves over 24 hours post-shock, not just endpoint values. Shows the trader "when would I have been green?"

### D. Portfolio Builder (Core — Multi-Market)

New page (`/portfolio`) where the user selects 2–4 shocks to fade simultaneously:

- Pick shocks from the table (prioritizing 🔴 LIVE signals)
- Set per-position size for each shock
- See combined portfolio payoff graph: individual position lines (thin) + combined portfolio line (bold)
- Portfolio statistics: total deployed capital, combined expected P&L, win rate, and **diversification benefit** (variance reduction from independent bets scaling as 1/√N)

This directly addresses the brief's call for "portfolio or strategy views that combine multiple markets into a single payoff graph."

### E. Interactive Dashboard

A clean, demo-ready Next.js web app deployed on Vercel showing:

- **Configurable controls**: shock threshold slider (θ), horizon picker, category filter — all dynamically refilter the data
- Top Shocks table — sortable by size, category, time, reversion outcome
- Aggregate histogram — distribution of post-shock moves
- Summary stats panel — reversion rate, mean magnitude, sample size, edge statistics
- Category breakdown — reversion rates by market type

### F. Live Shock Monitor (Core — This Is What Makes It a Trading Tool)

A Python process (`scripts/live_monitor.py`) that runs continuously and transforms ShockTest from a historical dashboard into a **live trading signal system**:

1. **Polls Polymarket** every 2 minutes for latest prices on all tracked markets
2. **Runs shock detection** on incoming data using the same algorithm and threshold
3. **When a new shock fires** → writes a live alert to MongoDB with:
   - The shock details (market, delta, timestamps)
   - **Historical edge context**: win rate, average P&L, and sample size for that shock's category — pulled from the backtest stats
   - `is_live_alert: true`, `is_recent: true`, `hours_ago: 0`
4. **Dashboard surfaces it immediately**: the Next.js frontend shows a prominent alert banner:

   > 🔴 **SHOCK DETECTED 8 min ago** — "Will BTC hit $100k by June?" dropped 65% → 53% (-12pp)
   > Historical edge: 65% of crypto shocks this size revert within 6h | Avg return: $0.034/$1
   > **[Analyze this shock →]**

5. **User clicks through** → detail page with payoff curve, scenario panel, and trade simulator pre-loaded with the live shock's parameters

This is the critical differentiator. The brief asks for tools that "help real traders make better decisions." A live monitor that says "a shock just happened, here's the historical edge, do you want to fade it?" is exactly that. Leave it running during the demo — if a shock fires while judges are watching, that's the winning moment.

### G. Gemini Shock Analyst (Core — MLH Gemini Prize)

When `live_monitor.py` detects a shock, it calls Gemini 2.5 Flash with the market title, direction, and magnitude. Gemini returns:

1. **What likely caused the shock** (one sentence — inferred from the market title + direction)
2. **Overreaction vs. legitimate information** (one sentence assessment)
3. **Reversion confidence** (low / medium / high)

Stored as `ai_analysis` on each shock event. Displayed on the live alert banner and shock detail page:

> 🔴 **SHOCK DETECTED 8 min ago** — "BTC above $100k by June?" dropped 65% → 53%
> **AI Analysis:** "Likely triggered by a BTC spot flash crash. Appears to be an overreaction — underlying fundamentals unchanged. High confidence of reversion."

This transforms Gemini from a label maker into a **trade reasoning engine**. Every live alert now answers the three questions a trader actually asks: what happened, is it an overreaction, and should I fade it. This is exactly what the MLH Gemini prize judges want to see — an LLM doing real analytical work, not string classification.

### H. P&L Heatmap (Core — The optionsprofitcalculator.com Clone)

The track brief explicitly links to [optionsprofitcalculator.com](https://www.optionsprofitcalculator.com/). Its signature feature is a 2D P&L heatmap. We build the prediction market equivalent:

- **X-axis**: probability (0% → 100%)
- **Y-axis**: days to resolution (1 → 180)
- **Color**: P&L of a fade position at that probability and time point (green = profit, red = loss)
- **Interactive**: hover any cell to see exact P&L, position size adjusts the entire grid
- **Break-even contour**: white line showing where profit flips to loss across the probability × time surface

Uses the time-decay model from the ScenarioPanel (mean reversion edge diminishes as resolution approaches). This is THE visualization that wins Best UI/UX — it's visually striking, immediately comprehensible, and directly referenced by the track brief.

### I. Stretch: Advanced Features

Only after MVP (A–H) is fully working:

- **Order Book Depth + Slippage Calculator**: Use Polymarket CLOB API for real liquidity data
- **Paper Trading + Live P&L Tracker**: "Fade This Shock" button → tracked positions with live P&L
- **Cross-Market Hedge Calculator**: Pair prediction markets with crypto positions
- **Cross-market shock correlation**: co-occurrence matrix of shocks across categories
- **Statistical significance**: confidence intervals on reversion rate

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
| "Allow a user to input positions, strategies, or parameters and see outputs update dynamically" | θ slider, horizon picker, category filter, position size input, scenario sliders (target probability, days to resolution) → all dynamically update charts and P&L projections |
| "Profit & loss visualizations across different probability outcomes" | **Payoff Curve** on every shock detail page shows P&L at all possible resolution outcomes (0–100%), with current price and mean-reversion target marked |
| "Scenario analysis tools that show how a position performs if an event resolves sooner vs later" | **Scenario Panel** with three sliders: target probability, days to resolution (with time-decay model), and position size — outputs update instantly |
| "Portfolio or strategy views that combine multiple markets into a single payoff graph" | **Portfolio Builder** page: select 2–4 shocks, set position sizes, see combined payoff graph with individual lines + bold portfolio line + diversification stats |
| "Produce concrete analytical or visual outputs" | Payoff curves, **P&L heatmap (probability × time)**, scenario outputs, P&L timelines, payoff distribution histograms, aggregate histograms, category breakdown tables |
| "Be grounded in real trading use cases" | **Live Shock Monitor** polls Polymarket every 2 min, detects shocks in real-time, and surfaces them with **Gemini AI analysis** explaining what caused each shock and whether to fade it |
| "Quality of insight and correctness of modeling" | Falsifiable hypothesis, transparent methodology, explicit caveats, time-decay model, **AI-powered shock analysis that reasons about overreaction vs. information** |
| "Strength of visualization and UX" | Interactive payoff curves, **P&L heatmap (the optionsprofitcalculator.com clone)**, 3-slider scenario panel, trade simulator, P&L timeline, configurable dashboard controls, live alert banners with AI analysis |
| "Technical depth and execution" | Multi-source data pipeline, **live polling loop with real-time shock detection**, **Gemini real-time reasoning integrated into detection loop**, configurable event detection, portfolio diversification math, full-stack deployment |
| "Creativity and originality" | Novel approach: treating prediction market overreactions as a systematic signal, quantifying the edge, building TradFi-style tools around it, **AI analyst that explains WHY each shock happened and whether to fade it** |
| "Clarity of explanation" | Concrete user story: "Live shock detected → AI explains what happened → P&L heatmap shows where this trade is profitable → scenario sliders let you explore → size the trade" |

---

## 5. Technical Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Data | `polymarket-apis` + `requests` + `pandas` | Fetch & store market time series from Polymarket (primary) and Manifold (supplemental) |
| Storage | **MongoDB Atlas** (free M0 cluster) | Cloud database for market time series, shock events, backtest results, and aggregate stats |
| Analysis | `pandas` + `numpy` | Shock detection, post-shock outcomes, fade strategy backtest |
| AI Analysis | **Google Gemini 2.5 Flash** (free tier) | Real-time shock analysis: infers likely cause, overreaction assessment, reversion confidence for each live alert |
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
| 16–20 | **Build + deploy `live_monitor.py` (CORE).** Flag recent shocks. Write README, support bugs | **Add Gemini Shock Analyst to `live_monitor.py` (CORE).** Validate results, write findings, Devpost draft. | Wire real data. Payoff curve + scenario panel. Full integration. Deploy to Vercel. |
| 20–24 | **Keep live monitor running during demo.** Help with Devpost. | Help Person 3 integrate AI analysis display. Polish. | **P&L Heatmap (CORE).** Portfolio Builder. Live alert banner with AI analysis. UI polish. Film reel. Submit. |

---

## 7. Hour-by-Hour Detail (Remaining Work)

### Next Steps — Two Core Features to Build Now

**Person 2 — Gemini Shock Analyst (~1h)**
- Add `analyze_shock_with_gemini()` function to `scripts/live_monitor.py`
- When a new shock is detected, call Gemini 2.5 Flash before writing to MongoDB
- Store the `ai_analysis` object on each shock event: `{likely_cause, overreaction_assessment, reversion_confidence}`
- Also backfill: run Gemini on the 15 most recent live alerts that don't have `ai_analysis` yet
- Help Person 3 display the AI analysis on the live alert banner and shock detail page

**Person 3 — P&L Heatmap (~3h)**
- Build `components/PnlHeatmap.tsx` — 2D grid: x = probability (0–100%), y = days to resolution (1–180), color = P&L
- Uses the same payoff math as PayoffCurve + the time-decay model from ScenarioPanel
- Green = profit, red = loss, hover shows exact P&L
- Position size input adjusts the entire grid dynamically
- Place on shock detail page between PayoffCurve and ScenarioPanel
- Also: display `ai_analysis` on live alert banner and shock detail page (Person 2 provides the data)

**Person 1 — Support + Demo Prep**
- Keep `live_monitor.py` running (Person 2 will modify it to add Gemini)
- Restart monitor after Person 2's changes
- Polish README with final numbers
- Help with Devpost submission

---

## 8. Demo Script (3 Minutes)

> **Opening Hook (20 sec)**
> *"Prediction markets overreact. We built a live system that detects it, uses AI to explain why it happened, and gives you TradFi-grade tools to decide whether to trade it — all in real-time on Polymarket."*
>
> **Live Signal + AI Analysis (50 sec)**
> Show the live monitor terminal: *"This is polling Polymarket every 2 minutes."* Show the 🔴 LIVE alert banner with Gemini analysis: *"This shock was detected 8 minutes ago. Our AI analyst says: 'Likely triggered by a BTC spot flash crash. This appears to be an overreaction — high confidence of reversion.' That's Gemini reasoning about the shock in real-time."*
>
> **The Trading Tools (70 sec)**
> Click into the shock. *"First, the P&L heatmap."* Show the probability × time grid: *"Green is profit, red is loss. You can see exactly where and when this fade trade works — the sweet spot is 2-4 weeks out at 40-60% probability."* Then: *"The payoff curve — P&L at every possible resolution."* Drag scenario sliders: *"What if probability moves to 70%? What if it resolves next week? Outputs update instantly."* Show trade simulator: *"Historically, 60% of crypto shocks this size revert within 6 hours. Enter $200 — expected P&L is $6.80."*
>
> **Portfolio (20 sec)**
> Navigate to Portfolio Builder — select 3 shocks. *"Combined payoff graph — diversification cuts variance by 40%."*
>
> **Close (10 sec)**
> *"Detect. Analyze. Visualize. Trade. All live at shocktest.xyz."*

---

## 9. Resume & Interview Talking Points

| What You Did | How You Say It |
|-------------|----------------|
| Shock detection + live monitor | Built a configurable event detection algorithm on Polymarket probability time series, plus a live polling system that detects shocks in real-time and surfaces them with historical edge context |
| AI shock analyst | Integrated Gemini into the live detection loop to provide real-time trade intelligence — likely cause, overreaction assessment, and reversion confidence — on every detected shock |
| P&L heatmap | Built a probability × time P&L heatmap (inspired by optionsprofitcalculator.com) showing the profitable zone for fade positions across all possible outcomes and resolution timelines |
| Trading tools | Built interactive payoff curves, scenario analysis with time-decay modeling, and a position-sizing simulator that projects P&L from historical reversion distributions |
| Portfolio builder | Built a multi-market portfolio constructor showing combined payoff graphs with diversification benefit calculations |
| Full stack delivery | Shipped a live trading signal system (Next.js + Vercel + Python live monitor) integrating Polymarket's Gamma API, MongoDB Atlas, Gemini, and 6+ interactive trading tools — in 24 hours |

> **Interview angle:** *"I built a live trading signal system for Polymarket prediction markets. A Python monitor polls for probability shocks every 2 minutes — when it detects one, Gemini analyzes what caused it and whether it's an overreaction. The trader then sees a P&L heatmap across probability and time, interactive scenario sliders, and a backtest-powered trade simulator. We found that 60% of large shocks revert within 6 hours."*

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
| **Prediction Markets** (Polymarket) | $2,000 / $1,000 / $500 | Gamma API as primary data source. Live shock monitor, **P&L heatmap** (the optionsprofitcalculator.com clone they reference in the brief), payoff curves, scenario analysis, portfolio builder. |
| **Grand Prize** (YHack) | $4,000 / $2,000 / $1,000 | Automatic eligibility — live AI-powered trading signal system is genuinely impressive for 24h |
| **MongoDB Atlas** (MLH) | M5Stack IoT Kit per member | Free M0 cluster for all data storage |
| **Google Gemini** (MLH) | Google Swag Kit per member | **Gemini Shock Analyst** — real-time trade intelligence on every detected shock (likely cause, overreaction assessment, reversion confidence). This is real analytical reasoning, not just classification. |
| **GoDaddy Registry** (MLH) | ~$50 gift card | `shocktest.xyz` via `mlh.link/godaddyregistry` |
| **Most Creative Hack** (YHack) | $100 | AI-powered live trading signal system for prediction markets — unlike anything else at the hackathon |
| **Best UI/UX** (YHack) | $100 | **P&L heatmap** (probability × time) is the visual showstopper |
| **Most Viral Post** (@YHack) | $100 | Film the P&L heatmap updating with a live shock — visually striking |

**Total exposure: up to $6,350 + hardware + swag** across 8 categories.

---

## 13. MongoDB Schema Additions

The existing schema stays the same. Add these fields:

**`shock_events` collection — new fields per shock:**
```
fade_pnl_1h: float | null
fade_pnl_6h: float | null
fade_pnl_24h: float | null
is_live_alert: boolean
detected_at: string | null        // ISO timestamp
historical_win_rate: float | null
historical_avg_pnl: float | null
historical_sample_size: int | null
ai_analysis: {                    // Gemini shock analyst output
  likely_cause: string,
  overreaction_assessment: string,
  reversion_confidence: "low" | "medium" | "high"
} | null
```

**`shock_results` collection — new fields in aggregate_stats:**
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