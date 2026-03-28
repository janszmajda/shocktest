# ShockTest
## *Do Prediction Markets Overreact?*
### YHack Spring 2026 · Prediction Markets Track · 24-Hour Build

---

> **TL;DR**
> ShockTest pulls live prediction market data from **Polymarket** (sponsor) and Manifold Markets, detects large probability jumps ("shocks"), and measures whether markets systematically mean-revert or trend afterward. The result is a quant-style analytics dashboard backed by **MongoDB Atlas**, with market categorization powered by **Google Gemini** — delivering a concrete, falsifiable conclusion built in 24 hours by a team of three.

---

## 1. The Hypothesis

Prediction markets are often described as efficient aggregators of information — but they can still overreact to headlines, herd during high-attention moments, or temporarily misprice due to low liquidity.

We test a single, falsifiable question:

> **H₀ (null):** After a large probability shock, future changes are random / symmetric.
> **H₁ (alt):** After a large shock, probabilities systematically mean-revert (A) or continue trending (B).

We will quantify which is more common, how strong the effect is, and whether it differs by market category (politics vs. sports vs. crypto).

---

## 2. What We Build

### A. Shock Detection

Scans all tracked markets for large, fast probability moves using a configurable threshold. Each detected shock is logged with its market name, timestamp window, probability before/after, and delta.

### B. Post-Shock Analysis

For each shock, measures what happens at horizons h ∈ {1h, 6h, 24h}. Computes reversion amount, continuation amount, and aggregates results across all shocks:

- % of shocks that revert vs. continue
- Mean reversion magnitude and standard deviation
- Histogram of post-shock probability changes
- Breakdown by market category — categories assigned automatically via **Google Gemini** from market titles

### C. Interactive Dashboard

A clean, demo-ready Next.js web app deployed on Vercel showing:

- Top Shocks table — sortable by size, category, time
- Per-shock chart — probability over time with shock window highlighted
- Aggregate histogram — distribution of post-shock moves
- Summary stats panel — reversion rate, mean magnitude, sample size

### D. Stretch: Fade Strategy Backtest

Rule: when probability jumps by ≥X in window T, bet opposite. Evaluate average outcome at horizon H. This is not a money-making claim — it is a demonstration of quant logic and backtesting methodology.

---

## 3. Methodology

### Shock Definition

A shock occurs when the absolute change in implied probability exceeds a threshold within a time window:

```
|p(t₂) − p(t₁)| ≥ θ   where Δt = t₂ − t₁ ≤ T
```

> **Default Parameters (tunable during build)**
> θ = 0.08 (8 percentage point move)
> T = 1 hour (or shortest available resolution)

### Post-Shock Measurement

For each detected shock at time t₂, record:

```
shock_size  = p(t₂) − p(t₁)
post_move   = p(t₂ + h) − p(t₂)    for h ∈ {1h, 6h, 24h}
reversion   = −sign(shock_size) × post_move
```

Positive reversion = price moved back toward pre-shock level. Negative = continued in shock direction.

### Aggregation Metrics

| Metric | Definition |
|--------|------------|
| Reversion Rate | % of shocks where reversion > 0 |
| Mean Reversion | Average reversion magnitude across all shocks |
| Effect by Category | Reversion rate split by politics / sports / crypto |
| Sample Size | Number of valid shocks per horizon |

---

## 4. Technical Stack

### Python Backend + Next.js Frontend (best path to polished demo)

| Layer | Tool | Purpose |
|-------|------|---------|
| Data | `polymarket-apis` + `requests` + `pandas` | Fetch & store market time series from Polymarket (primary) and Manifold (supplemental) |
| Storage | **MongoDB Atlas** (free M0 cluster) | Cloud database for market time series + shock results — replaces local JSON/CSV |
| Analysis | `pandas` + `numpy` | Shock detection, post-shock stats |
| Categorization | **Google Gemini 2.5 Flash** (free tier) | Auto-classify markets into politics / sports / crypto / other from titles |
| Charts | `recharts` or `plotly.js` | Interactive probability charts in React |
| Dashboard | **Next.js** + **Vercel** | Production-grade web app with full CSS control, deployed via `vercel deploy` |
| Domain | **GoDaddy Registry** (free via MLH) | Custom domain for deployed app |

### Architecture: Python Backend → MongoDB → Next.js Frontend

Persons 1 & 2 work entirely in Python — fetching data, detecting shocks, running analysis, and writing results to MongoDB. Person 3 builds a Next.js app that reads from MongoDB via API routes (`/api/shocks`, `/api/markets`, `/api/stats`) and renders the dashboard. This means the backend and frontend are fully decoupled: Person 3 can build UI with dummy data while Persons 1 & 2 are still populating MongoDB. Deploy with `vercel deploy` — zero config, instant production URL, custom domain support built in.

### Primary Data Source: Polymarket (Track Sponsor)

Polymarket's Gamma API is read-only, public, and requires no authentication. The `polymarket-apis` PyPI package provides:

- `get_price_history(token_id)` — price history at 2-minute resolution
- `get_recent_price_history(token_id)` — last 1h, 6h, 1d, 1w, 1m
- `get_markets()` — list active markets with current probability, volume, liquidity

Key endpoint: `https://gamma-api.polymarket.com/markets`

**Why Polymarket first:** Polymarket is the Prediction Markets track sponsor. Using their data directly signals alignment with the track. Their 2-min price resolution is also significantly better than Manifold's bet-history-based approach for shock detection.

### Supplemental Data Source: Manifold Markets

Manifold adds category diversity (more niche/community markets). Key endpoints:

- `GET /v0/markets` — list active markets with current probability
- `GET /v0/market/{id}/bets` — full bet history (timestamps + probabilities)
- Free, no auth required for read access

Use Manifold to pad sample size if Polymarket alone yields too few shocks.

---

## 5. 24-Hour Team Split (3 People)

Work in parallel where possible. Person 1 unblocks Persons 2 and 3 as early as Hour 2.

| Hours | Person 1 (Data) | Person 2 (Analysis) | Person 3 (Frontend) |
|-------|----------------|---------------------|---------------------|
| 0 – 2 | Register GoDaddy domain (5 min). Set up MongoDB Atlas free cluster (15 min). Install `polymarket-apis`, pull sample market, confirm price history fields. | Help verify Polymarket data shape, plan metrics | Scaffold Next.js app with Claude Code (`npx create-next-app`), install deps (`recharts`, `mongodb`), deploy skeleton to Vercel |
| 2 – 6 | Fetch 50+ Polymarket markets, store time series in MongoDB. Pull supplemental Manifold markets. | Write rolling delta helper functions | Build top shocks table component (React + dummy data), set up API routes to read from MongoDB |
| 6 – 10 | Resample to fixed intervals, validate data quality across both sources | Implement shock detector (threshold scan) | Build per-shock probability chart component (Recharts `LineChart` with shock window highlight) |
| 10 – 16 | Expand to 100+ markets across both sources | Compute post-shock outcomes at 1h/6h/24h. **Use Gemini 2.5 Flash to auto-categorize markets** (politics/sports/crypto/other) from titles. | Aggregate histogram component + summary stats cards. Build layout/navigation. |
| 16 – 20 | MVP complete — support analysis bugs | Validate results manually, write findings text | Wire real MongoDB data into all Next.js pages via API routes |
| 20 – 24 | Stretch: fade strategy backtest | Stretch: category breakdown analysis | **Polish UI for Best UI/UX track** (Tailwind styling, animations, chart readability). Prepare demo flow + README. **Film 30-sec reel for Most Viral Post.** |

> **⚠ Key Dependency:** Person 1 must confirm the Polymarket Gamma API returns usable price history data by Hour 2. Everything downstream depends on this. The `polymarket-apis` package's `get_price_history()` should return 2-min resolution data per token_id. If it's unavailable or too sparse, fall back to Manifold bet history as primary, or hand-log 5–10 markets during the hackathon.

---

## 6. Hour-by-Hour Build Plan

### Hours 0–2 · Setup, Data Verification & Prize Infra

**Person 1 priority tasks (first 30 min):**
- Register domain at `mlh.link/godaddyregistry` using code `YHack26` (e.g., `shocktest.xyz`) — 5 min
- Create free MongoDB Atlas M0 cluster at `mongodb.com/atlas` — 15 min
  - Choose AWS / us-east-1, name it `shocktest`
  - Whitelist IP `0.0.0.0/0` for hackathon (restrict later)
  - Get connection string, test with `pymongo`

**All team:**
- Clone repo, install Python deps: `pip install polymarket-apis pymongo requests pandas numpy google-generativeai`
- Person 3: `npx create-next-app@latest shocktest-dashboard --typescript --tailwind --app` then `npm install recharts mongodb`
- Test Polymarket: `pip install polymarket-apis`, call `get_markets()` — confirm you get market question + probability + token_id
- Test price history: call `get_price_history(token_id)` on one active market — confirm timestamps + price data at 2-min resolution
- Save one market's time series to MongoDB collection `market_series`
- **Decision gate:** if Polymarket data looks good → proceed as primary. If not → swap to Manifold primary, Polymarket supplemental.

### Hours 2–6 · Data Pipeline

- Fetch top N=50 active Polymarket markets (filter: binary outcome, decent volume)
- For each market, pull full price history → store in MongoDB `market_series` collection
- Pull supplemental Manifold markets (20–30 additional) for category diversity → store in same collection
- Write `get_delta(series, window)` helper — returns rolling Δp
- Each document in MongoDB: `{market_id, source, question, token_id, series: [{t, p}, ...], category: null}`

### Hours 6–10 · Shock Detection

- Write `find_shocks(market_id, theta=0.08, window_hrs=1)` function
- Returns list of `{market, source, t1, t2, p_before, p_after, delta}`
- Run on all markets → save to MongoDB `shock_events` collection
- Sanity check: manually inspect 3–5 detected shocks — do they look real?

### Hours 10–16 · Post-Shock Analysis + Gemini Categorization

- **Gemini categorization (Person 2, ~30 min):**
  - Get free Gemini API key via Google AI Studio (no credit card needed)
  - For each market, send title to Gemini 2.5 Flash: *"Classify this prediction market into exactly one category: politics, sports, crypto, entertainment, science, or other. Market: '{question}'. Respond with only the category name."*
  - Free tier = 10 RPM / 250 req/day — more than enough for 100 markets
  - Update MongoDB documents with `category` field
- For each shock, look up `p(t2 + 1h)`, `p(t2 + 6h)`, `p(t2 + 24h)`
- Compute `reversion = −sign(delta) × post_move` for each horizon
- Aggregate: `reversion_rate`, `mean_reversion`, `std_reversion`
- Save results to MongoDB `shock_results` collection
- Generate 3 key plots: shock timeline, post-shock distribution, reversion by category

### Hours 16–20 · MVP Dashboard

- Wire all data from MongoDB into Next.js via API routes (`/api/shocks`, `/api/markets`, `/api/stats`)
- Top Shocks table with filters (category, min shock size, date range, data source)
- Clickable row → shows per-shock probability chart (Recharts `LineChart`)
- Aggregate histogram + summary stats card
- One-paragraph 'Findings' section at top with real numbers
- Add "Powered by Polymarket" attribution + data source badges
- Deploy to Vercel: `vercel deploy --prod`, point GoDaddy domain `shocktest.xyz` to Vercel

### Hours 20–24 · Polish + Stretch + Prize Submissions

- Write `README.md` with hypothesis, methodology, results, tech stack
- Stretch: implement fade strategy backtest + EV estimate
- Stretch: category breakdown table (politics vs. sports vs. crypto)
- **Best UI/UX polish (Person 3, 30 min):** consistent color palette, clear visual hierarchy, readable chart labels, smooth transitions, responsive layout — full CSS control via Tailwind
- **Film reel for Most Viral Post:** 30-sec screen recording of a dramatic shock reverting on the dashboard, post to Instagram tagging @yhack.yale
- Final `vercel deploy --prod`, verify `shocktest.xyz` resolves
- Prepare 3-minute demo script for judges
- **Submit on Devpost:** select Prediction Markets, Most Creative Hack, Best UI/UX tracks

---

## 7. Demo Script (3 Minutes)

> **Opening Hook (30 sec)**
> *"Prediction markets are supposed to be efficient. But are they? We built a tool to test a specific, quantifiable claim: when a prediction market experiences a sudden large probability jump, does the market overshoot and revert — or does it hold? This is the same question quant funds ask about asset prices every day. We pulled real data from Polymarket to find out."*
>
> **Show the Data (45 sec)**
> Show the Top Shocks table. Click into one compelling example — a political market that jumped 15% in one hour. Show the probability chart with the shock highlighted. Mention the data comes directly from Polymarket's API with 2-minute resolution.
>
> **The Finding (60 sec)**
> Show the aggregate histogram and summary stats. State your conclusion with real numbers: *"In our sample of X shocks across Y Polymarket markets, Z% showed mean reversion within 6 hours, with average magnitude W. Political markets reverted more often than sports markets — categories we classified automatically using Google Gemini."* This is your headline result.
>
> **So What? (45 sec)**
> If you built the backtest: show the fade strategy result. Emphasize this is exploratory, not a trading system. The point is you identified a measurable behavioral pattern in real market data. Close with: *"All data is stored in MongoDB Atlas and the app is live at shocktest.xyz."*

---

## 8. Resume & Interview Talking Points

This is why ShockTest beats a generic dashboard for quant/fintech/SWE recruiting:

| What You Did | How You Say It |
|-------------|----------------|
| Shock detection | Implemented a configurable event detection algorithm on probability time series from Polymarket, analogous to volatility spike detection in equity markets |
| Post-shock analysis | Designed and ran a quantitative study on mean reversion behavior across 100+ prediction markets, producing statistically grounded conclusions |
| Category breakdown | Used LLM-based classification (Gemini) to auto-tag market categories, then identified differential reversion patterns suggesting behavioral vs. informational drivers of price shocks |
| Fade backtest | Built a toy backtest to evaluate an edge hypothesis, accounting for transaction costs and reporting in-sample EV with appropriate caveats |
| Full stack delivery | Shipped a production web app (Next.js + Vercel) integrating Polymarket's API, MongoDB Atlas for cloud storage, Gemini for NLP classification, and interactive data visualization — in 24 hours |

> **Interview angle:** When asked "tell me about a project," you can say: *"I ran a quantitative study on whether prediction markets overreact to news events, using real Polymarket data. We found that X% of large probability shocks reversed within 6 hours. We classified markets by category using Gemini and found political markets reverted more than sports. We then tested whether a simple contrarian strategy had positive expected value in-sample."* That framing is instantly credible at any quant or fintech firm.

---

## 9. Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Polymarket Gamma API rate-limited or sparse | Low | Gamma API is public/read-only with no strict rate limit for reads. Cache in MongoDB. Fall back to Manifold as primary if needed. |
| Manifold API rate-limited or sparse | Medium | Manifold is supplemental — losing it only reduces sample size, doesn't block the project. |
| MongoDB Atlas setup issues | Low | Takes ~15 min. If blocked, fall back to local JSON/CSV — can migrate later. Don't let this block Person 2 or 3. |
| Gemini API key or quota issues | Low | Free tier gives 250 req/day. If blocked, manually tag 20 markets into categories — still works for category breakdown. |
| Not enough shocks in data | Low-Medium | Lower θ to 0.05; combine both Polymarket and Manifold data; use all available historical price data |
| Analysis produces null result (no reversion) | Low | A null result is still a valid finding — "markets are efficient in this sample" is a legitimate conclusion |
| Dashboard not finished in time | Low | Person 3 uses Claude Code heavily for Next.js scaffolding. If still blocked, fall back to a single-page HTML with Plotly.js — charts and a clear conclusion still win on quant merit |
| Next.js / Vercel deployment issues | Low | Vercel deploys from git push with zero config. If blocked, deploy as static HTML to any host. Don't let deployment block the analysis. |
| Team blocked on data shape | Low | Persons 2 and 3 can work on analysis logic and UI shell with mock data while Person 1 fixes the pipeline |

---

## 10. Scope Guardrails — What NOT to Build

These are explicitly out of scope. Do not start them until the MVP is fully working:

> **Do not build these before MVP is done:**
> - ML-based shock prediction (out of scope and not better than your simple stat)
> - Real-time live updates / WebSocket feeds (adds infra complexity, no demo benefit)
> - Connecting to a wallet or executing real trades
> - Calibration analysis or Bayesian updating (save for post-hackathon)
> - Hex API integration (requires paid plan + major frontend pivot — not worth the scope creep)

---

## 11. Prize Strategy

### Tracks We're Targeting

| Track | Prize | What We Do | When |
|-------|-------|-----------|------|
| **Prediction Markets** (Polymarket) | $2,000 / $1,000 / $500 | Use Polymarket Gamma API as primary data source. `pip install polymarket-apis`. | Core — built into pipeline from Hour 0 |
| **Grand Prize** (YHack) | $4,000 / $2,000 / $1,000 | Automatic eligibility. Build the best possible project. | No extra work |
| **MongoDB Atlas** (MLH) | M5Stack IoT Kit per member | Free M0 cluster replaces local JSON/CSV storage. | Person 1, Hours 0–2 (~15 min setup) |
| **Google Gemini** (MLH) | Google Swag Kit per member | Gemini 2.5 Flash auto-categorizes markets from titles. | Person 2, Hours 10–16 (~30 min) |
| **GoDaddy Registry** (MLH) | ~$50 gift card | Register `shocktest.xyz` via `mlh.link/godaddyregistry`, code `YHack26`. | Person 1, Hour 0 (5 min) |
| **Most Creative Hack** (YHack) | $100 | Select on Devpost. Quant research at a hackathon is inherently unusual. | Submission only |
| **Best UI/UX** (YHack) | $100 | 30 min polish pass with full CSS/Tailwind control — much higher ceiling than Streamlit. | Person 3, Hours 20–24 |
| **Most Viral Post** (@YHack) | $100 | Film 30-sec reel of dramatic shock on dashboard, post tagging @yhack.yale. | Anyone, Hours 20–24 (10 min) |

### Total Prize Exposure

**Up to $6,350 + hardware + swag** across 8 categories, with only ~2 hours of incremental work beyond the core project.

### Tracks We're NOT Targeting (and why)

- **Entertainment** (Snapchat) — analytical project, not entertainment
- **Personal AI Agent** (Harper) — not building an agent
- **Societal Impact** (ASUS) — hard to argue vs. health/education projects
- **Hardware** (QNX) — no physical hardware
- **Snap Lens Studio** — irrelevant
- **Hermes / Lava / Viam / K2 Think V2** — would require major pivots
- **Hex API** — requires paid plan + full frontend rebuild; $2K isn't worth the scope risk
- **Built with Zed** — IDE choice doesn't affect our project enough to compete
- **Best First Hack** — check eligibility (requires ≤1 prior hackathon participant)
- **Best Solo Hack** — team of 3
- **ElevenLabs / Auth0 / Solana** — don't fit our project
