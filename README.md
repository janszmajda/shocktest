# ShockTest

**Do Prediction Markets Overreact?**

ShockTest is a quantitative analysis tool that detects large probability shocks in prediction markets and measures whether they systematically mean-revert afterward. Built in 24 hours at YHack Spring 2026.

## The Hypothesis

Prediction markets are often described as efficient, but they can overreact to headlines, herd during high-attention moments, or temporarily misprice due to low liquidity.

We test a single, falsifiable question:

> **H0 (null):** After a large probability shock, future price changes are random.
> **H1 (alt):** After a large shock, probabilities systematically mean-revert.

## Methodology

### Shock Detection

A shock occurs when the absolute change in implied probability exceeds a threshold within a time window:

```
|p(t2) - p(t1)| >= theta    where t2 - t1 <= T
```

- **theta** = 0.08 (8 percentage point move)
- **T** = 1 hour

### Post-Shock Measurement

For each detected shock at time t2:

```
shock_size = p(t2) - p(t1)
post_move  = p(t2 + h) - p(t2)     for h in {1h, 6h, 24h}
reversion  = -sign(shock_size) * post_move
```

Positive reversion = price moved back toward pre-shock level.

### Aggregation

| Metric | Definition |
|--------|------------|
| Reversion Rate | % of shocks where reversion > 0 |
| Mean Reversion | Average reversion magnitude across all shocks |
| Effect by Category | Reversion rate split by politics / sports / crypto / other |
| Sample Size | Number of valid shocks per horizon |

## Results

<!-- PLACEHOLDER: Replace with real numbers once analysis completes -->

| Metric | Value |
|--------|-------|
| Markets Analyzed | _TBD_ |
| Total Shocks Detected | _TBD_ |
| 6h Reversion Rate | _TBD_ |
| Mean 6h Reversion | _TBD_ |

_Results will be populated with real data from our analysis pipeline._

## Tech Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Data Fetching | `requests` + Polymarket Gamma API + CLOB API | Fetch market listings and price history |
| Supplemental Data | Manifold Markets API | Additional market diversity |
| Storage | **MongoDB Atlas** (free M0) | Cloud database for time series + shock results |
| Analysis | `pandas` + `numpy` | Shock detection, post-shock statistics |
| Categorization | **Google Gemini 2.5 Flash** | Auto-classify markets by category from titles |
| Frontend | **Next.js 14** + TypeScript + Tailwind CSS + Recharts | Interactive analytics dashboard |
| Deployment | **Vercel** | Production hosting |
| Domain | **GoDaddy** (via MLH) | Custom domain |

## Architecture

```
Polymarket API ──┐
                 ├──> Python scripts ──> MongoDB Atlas ──> Next.js API routes ──> Dashboard
Manifold API ────┘        (scripts/)       (shocktest)      (dashboard/api/)     (dashboard/)
                          + analysis/
```

- **Person 1** (`scripts/`): Data pipeline — fetch, clean, normalize market data
- **Person 2** (`analysis/`): Shock detection, post-shock analysis, Gemini categorization
- **Person 3** (`dashboard/`): Next.js frontend with interactive charts and tables

## Data Sources

- **Polymarket** (primary): Binary prediction markets with ~10-min resolution price history via CLOB API
- **Manifold Markets** (supplemental): Community prediction markets with bet-level price history

## Running Locally

```bash
# Set environment variables
export MONGODB_URI="your_mongodb_connection_string"
export GEMINI_API_KEY="your_gemini_key"  # Person 2 only

# Fetch data
python scripts/fetch_polymarket.py
python scripts/fetch_manifold.py
python scripts/resample.py

# Run analysis
python analysis/run_all.py

# Start dashboard
cd dashboard && npm install && npm run dev
```

## Team

Built at YHack Spring 2026 by a team of three.

## Acknowledgments

- **Polymarket** — Prediction Markets track sponsor, primary data source
- **MongoDB Atlas** — Cloud database
- **Google Gemini** — Market categorization
- **Vercel** — Dashboard hosting
- **GoDaddy** — Domain registration via MLH
