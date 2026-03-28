# CLAUDE.md — Project Instructions for Claude Code

## Project Overview

ShockTest is a prediction market analysis tool built in 24 hours at YHack 2026. It pulls data from Polymarket's Gamma API, detects large probability shocks, and measures whether markets systematically mean-revert afterward.

## Reference Documents

Read these before starting any task:
- `docs/RepoStructure.md` — file tree, MongoDB schemas, TypeScript interfaces, ownership
- `docs/Playbook.md` — hour-by-hour build instructions with exact scripts and done criteria
- `docs/Plan.md` — hypothesis, methodology, prize strategy (read for context, not for code)

## Repo Structure

```
shocktest/
├── scripts/          # Person 1 — Python data fetching
├── analysis/         # Person 2 — Python analysis logic
├── dashboard/        # Person 3 — Next.js frontend
└── docs/             # Planning documents (read-only during build)
```

## Tech Stack

- **Python 3.11+**: scripts/ and analysis/ — uses pymongo, pandas, numpy, requests, google-generativeai
- **Next.js 14+ (App Router)**: dashboard/ — TypeScript, Tailwind CSS, Recharts
- **MongoDB Atlas**: shared database, connection string in env vars
- **Vercel**: deployment for dashboard/

## Commands

```bash
# Run all checks
mise run check

# Python only
mise run lint:py
mise run typecheck:py
mise run test:py

# Dashboard only
mise run lint:ts
mise run typecheck:ts
mise run build

# Data pipeline
mise run fetch          # Run full Polymarket + Manifold fetch
mise run analyze        # Run shock detection + post-shock + categorize + aggregate
mise run verify         # Print top 5 shocks for manual inspection

# Deploy
mise run deploy         # vercel --prod from dashboard/
```

## MongoDB Collections

Three collections in database `shocktest`. All field names are final — do not rename without updating all three codebases.

- `market_series` — written by scripts/, read by analysis/ and dashboard/api/
- `shock_events` — written by analysis/, read by dashboard/api/
- `shock_results` — written by analysis/, read by dashboard/api/

See `docs/RepoStructure.md` for full schemas.

## Code Conventions

- Python: use type hints, docstrings on public functions, f-strings for formatting
- TypeScript: use interfaces from `dashboard/lib/types.ts`, never `any`
- All MongoDB field names use snake_case
- All timestamps stored as unix seconds (float) in MongoDB, ISO strings in shock_events
- All probabilities stored as float 0-1 (not percentages)
- Commit messages prefixed with P1/P2/P3

## Environment Variables

- `MONGODB_URI` — all three people need this
- `GEMINI_API_KEY` — Person 2 only, added in Hour 10

Never commit `.env` or `.env.local` files.

## Claude Code Workflow

After writing or modifying any code, always run the appropriate checks:

**Python (scripts/ or analysis/):**
```bash
mise run format:py   # auto-fix formatting
mise run lint:py     # catch errors + unused imports
```

**TypeScript (dashboard/):**
```bash
mise run lint:ts     # eslint
mise run typecheck:ts  # tsc --noEmit
```

**Before every git push:**
```bash
mise run check       # runs lint:py + typecheck:ts + build — if this passes, deploy won't break
```

**Quick data checks:**
```bash
mise run db:status   # how many docs in each MongoDB collection?
mise run api:test    # are the API routes returning real data?
```

Fix any errors these commands surface before moving on to the next task.

## Common Pitfalls

- Polymarket `clobTokenIds` field might be a JSON string, not a list — parse accordingly
- Manifold timestamps are in milliseconds, Polymarket may be in seconds — always normalize to seconds
- MongoDB free tier is 512MB — don't store raw API responses, only extracted fields
- Recharts `ReferenceArea` needs x values that match the data format exactly
- Always `git pull` before starting a new coding block
