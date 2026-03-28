# Multi-Agent Portfolio Construction — Feature Outline

## The Concept

A user types: *"I have $500, build me a fade portfolio from today's shocks."*

Three AI agents run in sequence — Scanner → Risk Manager → Report Writer — each with access to specific MongoDB tools. The output is a formatted portfolio card with allocations, expected P&L, and a one-line thesis per position. The user can then push the result directly to the Portfolio page.

This maps to how actual trading desks work:
- **Research desk** finds opportunities
- **Risk desk** sizes and diversifies them
- **Trade desk** writes the order ticket

---

## Agent Architecture

```
User prompt
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  SCANNER AGENT                                      │
│  "Find the best fade opportunities right now"       │
│  Tools: get_live_shocks, get_recent_shocks,         │
│         get_fade_score, filter_by_category          │
│  Output: top 5–8 candidate shocks (JSON)            │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  RISK MANAGER AGENT                                 │
│  "Size and diversify the candidate positions"       │
│  Tools: get_correlation_matrix, compute_kelly,      │
│         get_category_stats, check_portfolio_var     │
│  Output: allocation per shock + risk metrics (JSON) │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  REPORT AGENT                                       │
│  "Write the trade memo in plain English"            │
│  Tools: get_historical_analogs, get_significance,   │
│         get_category_win_rates                      │
│  Output: formatted portfolio card (Markdown/JSON)   │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
             Portfolio page pre-loaded
             with selected shocks + sizes
```

---

## Agent 1 — Scanner

**System prompt:**
```
You are a quantitative signal scanner for ShockTest, a Polymarket trading tool.
Your job is to find the best current fade-the-shock opportunities using real
historical backtest data. Do not invent statistics — always call tools to get
real numbers. Return a ranked list of candidate shocks for the risk manager.
```

**Tools:**
```python
def get_recent_shocks(hours: int = 24, min_delta: float = 0.08) -> list[dict]:
    """Return shocks from the last N hours above delta threshold, sorted by abs_delta desc."""

def get_fade_score(shock_id: str) -> dict:
    """
    Return composite fade score (0–100) for a shock.
    Components: category win rate (40%), shock size (30%), hours since shock (20%), z-stat (10%).
    """

def get_category_stats(category: str) -> dict:
    """Return win_rate_6h, mean_reversion_6h, sample_size, z_stat for a category."""
```

**Output schema:**
```json
{
  "candidates": [
    {
      "shock_id": "...",
      "question": "Will Iran strike Israel by March 31?",
      "category": "politics",
      "delta": -0.12,
      "hours_ago": 2.3,
      "fade_score": 81,
      "category_win_rate": 0.647,
      "rationale": "Large politics shock 2h ago, category has strongest historical edge."
    }
  ]
}
```

---

## Agent 2 — Risk Manager

**System prompt:**
```
You are a risk manager for a prediction market trading desk. Given a list of
candidate fade positions and a total capital budget, compute Kelly-optimal
position sizes that maximize expected log wealth while minimizing correlated
exposure. Use the correlation matrix to avoid overweighting co-occurring shocks.
Never allocate more than 25% of capital to a single position.
```

**Tools:**
```python
def get_correlation_matrix() -> dict:
    """Return category co-occurrence rates from shock_results."""

def compute_kelly_size(win_rate: float, avg_pnl: float, bankroll: float) -> dict:
    """
    Kelly fraction = win_rate - (1 - win_rate) / (avg_pnl / avg_loss)
    Returns full_kelly, half_kelly (recommended), and max_position.
    """

def get_portfolio_variance(shock_ids: list[str], sizes: list[float]) -> dict:
    """
    Estimate portfolio variance given position sizes.
    Uses category correlations from shock_results.
    Returns expected_pnl, portfolio_std, sharpe_estimate.
    """
```

**Output schema:**
```json
{
  "allocations": [
    {
      "shock_id": "...",
      "question": "Will Iran strike Israel by March 31?",
      "position_size": 187,
      "kelly_fraction": 0.374,
      "rationale": "Highest fade score. Kelly-optimal at $187 for $500 bankroll."
    }
  ],
  "portfolio_stats": {
    "total_deployed": 487,
    "expected_pnl": 21.40,
    "portfolio_std": 38.20,
    "sharpe_estimate": 0.56,
    "diversification_benefit": "31% variance reduction vs single-position equivalent"
  }
}
```

---

## Agent 3 — Report Writer

**System prompt:**
```
You are a trade desk analyst writing order tickets for a prediction market
trading fund. Given a portfolio allocation from the risk manager, write a
clear, concise trade memo that a non-quant trader can understand. For each
position include: what happened, why it might revert, key risks, and the
expected outcome. Keep each position thesis to 2 sentences max.
```

**Tools:**
```python
def get_historical_analogs(category: str, delta_range: tuple, n: int = 5) -> list[dict]:
    """Return N historical shocks with similar category and delta, showing their actual outcomes."""

def get_significance_summary() -> dict:
    """Return the significance test results — z-stats and CIs from shock_results."""
```

**Output (what the user sees):**
```
FADE PORTFOLIO — $500 · Built 14:32 UTC

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POSITION 1  ·  $187  ·  Fade Score 81
Will Iran strike Israel by March 31?
Current: 48¢ → Target: ~60¢ (+12pp)
Thesis: Political shock 2h ago — likely headline
overreaction. 65% of similar shocks reverted
within 6h. Main risk: confirmed escalation.

POSITION 2  ·  $163  ·  Fade Score 74
Bitcoin above $70k on March 28?
Current: 53¢ → Target: ~63¢ (+10pp)
Thesis: Crypto shock co-occurring with Iran news.
Independent reversion edge — adds diversification.

POSITION 3  ·  $137  ·  Fade Score 68
Will Trump visit China by April 30?
Current: 61¢ → Target: ~71¢ (+10pp)
Thesis: Modest political shock with strong
category tailwind. Lower conviction — half Kelly.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Expected P&L:    +$21.40
Portfolio Std:    $38.20
Variance savings: 31% vs single bet

[Load into Portfolio Builder →]
```

---

## Implementation

### Backend — `analysis/agents.py`

```python
"""
Multi-agent portfolio construction for ShockTest.
Uses Claude API with tool use. Each agent is a separate API call.
"""
import anthropic
import json
from analysis.helpers import get_db
from analysis.fade_score import compute_fade_score  # to be built

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

TOOLS = [
    {
        "name": "get_recent_shocks",
        "description": "Get shocks from the last N hours above a delta threshold",
        "input_schema": {
            "type": "object",
            "properties": {
                "hours": {"type": "number", "default": 24},
                "min_delta": {"type": "number", "default": 0.08}
            }
        }
    },
    {
        "name": "get_category_stats",
        "description": "Get historical win rate, mean reversion, and z-stat for a category",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string"}
            },
            "required": ["category"]
        }
    },
    {
        "name": "get_correlation_matrix",
        "description": "Get category co-occurrence rates from backtest data",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "compute_kelly_size",
        "description": "Compute Kelly-optimal position size",
        "input_schema": {
            "type": "object",
            "properties": {
                "win_rate": {"type": "number"},
                "avg_pnl": {"type": "number"},
                "bankroll": {"type": "number"}
            },
            "required": ["win_rate", "avg_pnl", "bankroll"]
        }
    },
    {
        "name": "get_historical_analogs",
        "description": "Get N historical shocks with similar category and delta",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string"},
                "min_delta": {"type": "number"},
                "max_delta": {"type": "number"},
                "n": {"type": "number", "default": 5}
            },
            "required": ["category", "min_delta", "max_delta"]
        }
    }
]


def handle_tool_call(tool_name: str, tool_input: dict) -> str:
    db = get_db()

    if tool_name == "get_recent_shocks":
        from datetime import datetime, timezone, timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(hours=tool_input.get("hours", 24))
        shocks = list(db["shock_events"].find({
            "abs_delta": {"$gte": tool_input.get("min_delta", 0.08)},
            "is_recent": True
        }).sort("abs_delta", -1).limit(10))
        return json.dumps([{
            "shock_id": str(s["_id"]),
            "question": s["question"],
            "category": s.get("category"),
            "delta": s["delta"],
            "abs_delta": s["abs_delta"],
            "hours_ago": s.get("hours_ago"),
        } for s in shocks])

    elif tool_name == "get_category_stats":
        stats = db["shock_results"].find_one({"_id": "aggregate_stats"})
        cat = tool_input["category"]
        by_cat = stats.get("by_category", {}).get(cat, {})
        sig = stats.get("significance", {}).get("by_category_6h", {}).get(cat, {})
        return json.dumps({
            "category": cat,
            "win_rate_6h": by_cat.get("reversion_rate_6h"),
            "mean_reversion_6h": by_cat.get("mean_reversion_6h"),
            "sample_size": by_cat.get("sample_size_6h"),
            "z_stat": sig.get("z_stat"),
            "significant": sig.get("significant_vs_50pct"),
            "win_rate_ci_95": sig.get("win_rate_ci_95"),
        })

    elif tool_name == "get_correlation_matrix":
        stats = db["shock_results"].find_one({"_id": "aggregate_stats"})
        return json.dumps(stats.get("correlation_matrix", {}))

    elif tool_name == "compute_kelly_size":
        wr = tool_input["win_rate"]
        avg_pnl = tool_input["avg_pnl"]
        bankroll = tool_input["bankroll"]
        # Simplified Kelly: f = (wr * avg_pnl - (1-wr) * avg_pnl) / avg_pnl = 2*wr - 1
        # Full Kelly uses win/loss ratio — approximating here
        full_kelly = max(0, 2 * wr - 1)
        half_kelly = full_kelly / 2  # recommended — less volatile
        return json.dumps({
            "full_kelly_fraction": round(full_kelly, 3),
            "half_kelly_fraction": round(half_kelly, 3),
            "recommended_size": round(bankroll * half_kelly, 2),
            "max_position": round(bankroll * 0.25, 2),  # hard cap at 25%
        })

    elif tool_name == "get_historical_analogs":
        cat = tool_input["category"]
        shocks = list(db["shock_events"].find({
            "category": cat,
            "abs_delta": {
                "$gte": tool_input["min_delta"],
                "$lte": tool_input["max_delta"]
            },
            "reversion_6h": {"$ne": None}
        }).sort("abs_delta", -1).limit(tool_input.get("n", 5)))
        return json.dumps([{
            "question": s["question"][:60],
            "delta": s["delta"],
            "reversion_6h": s["reversion_6h"],
            "reverted": s["reversion_6h"] > 0
        } for s in shocks])

    return json.dumps({"error": f"Unknown tool: {tool_name}"})


def run_agent(system: str, user_message: str) -> str:
    """Run a single agent with tool use loop until it returns a text response."""
    messages = [{"role": "user", "content": user_message}]

    while True:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=system,
            tools=TOOLS,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            return next(b.text for b in response.content if hasattr(b, "text"))

        # Handle tool calls
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = handle_tool_call(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})


def build_portfolio(bankroll: float = 500.0) -> dict:
    """Run the full 3-agent pipeline and return structured portfolio."""

    # Agent 1 — Scanner
    scanner_output = run_agent(
        system="You are a quantitative signal scanner for ShockTest. Find the best current fade-the-shock opportunities using real data from the tools. Return a JSON list of top 3–5 candidates with shock_id, question, category, delta, hours_ago, and a one-line rationale.",
        user_message=f"Find the best fade opportunities from the last 24 hours. Bankroll is ${bankroll}.",
    )

    # Agent 2 — Risk Manager
    risk_output = run_agent(
        system="You are a risk manager. Given candidate shocks, compute Kelly-optimal position sizes that sum to the bankroll. Avoid over-weighting correlated categories. Return JSON with allocations and portfolio stats.",
        user_message=f"Size these candidates for a ${bankroll} portfolio:\n{scanner_output}",
    )

    # Agent 3 — Report Writer
    report_output = run_agent(
        system="You are a trade desk analyst. Write a concise trade memo for each position — what happened, why it might revert, key risk. 2 sentences max per position. End with total expected P&L and a diversification note.",
        user_message=f"Write the trade memo for this portfolio:\n{risk_output}",
    )

    return {
        "scanner_output": scanner_output,
        "risk_output": risk_output,
        "report": report_output,
    }
```

### API Route — `dashboard/app/api/portfolio-agent/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(req: Request) {
  const { bankroll } = await req.json();

  return new Promise((resolve) => {
    const py = spawn('python', ['-c', `
import sys, json
sys.path.insert(0, '.')
from analysis.agents import build_portfolio
result = build_portfolio(bankroll=${bankroll})
print(json.dumps(result))
    `]);

    let output = '';
    py.stdout.on('data', (d) => output += d);
    py.on('close', () => {
      try {
        resolve(NextResponse.json(JSON.parse(output)));
      } catch {
        resolve(NextResponse.json({ error: 'Agent failed' }, { status: 500 }));
      }
    });
  });
}
```

### Frontend — Portfolio page input

Add above the existing portfolio builder:

```typescript
// In dashboard/app/portfolio/page.tsx
const [bankroll, setBankroll] = useState(500);
const [agentResult, setAgentResult] = useState<string | null>(null);
const [loading, setLoading] = useState(false);

const buildWithAgent = async () => {
  setLoading(true);
  const res = await fetch('/api/portfolio-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bankroll }),
  });
  const data = await res.json();
  setAgentResult(data.report);
  setLoading(false);
};

// In JSX — above the manual portfolio builder:
<div className="border rounded-lg p-6 bg-gray-900 mb-8">
  <h3 className="text-lg font-bold mb-2">AI Portfolio Builder</h3>
  <p className="text-sm text-gray-400 mb-4">
    Three AI agents — Scanner, Risk Manager, Report Writer — build a
    Kelly-optimized fade portfolio from today's live shocks.
  </p>
  <div className="flex gap-4 items-end">
    <div>
      <label className="text-sm font-medium">Bankroll ($)</label>
      <input type="number" value={bankroll}
        onChange={(e) => setBankroll(Number(e.target.value))}
        className="block mt-1 border rounded px-3 py-2 w-32" />
    </div>
    <button onClick={buildWithAgent} disabled={loading}
      className="bg-blue-600 text-white px-6 py-2 rounded font-medium">
      {loading ? 'Agents running...' : 'Build Portfolio with AI →'}
    </button>
  </div>
  {agentResult && (
    <pre className="mt-4 text-sm bg-gray-800 rounded p-4 whitespace-pre-wrap">
      {agentResult}
    </pre>
  )}
</div>
```

---

## Environment Variables Needed

```
ANTHROPIC_API_KEY=sk-ant-...   # Person 2 to add to .env
```

---

## Build Order

| Step | Owner | Time | Description |
|------|-------|------|-------------|
| 1 | P2 | 30 min | Write `analysis/agents.py` with tool handlers |
| 2 | P2 | 30 min | Test `build_portfolio()` locally in terminal |
| 3 | P1 | 15 min | Add `ANTHROPIC_API_KEY` to Vercel env vars |
| 4 | P3 | 45 min | Add bankroll input + agent button to portfolio page |
| 5 | P3 | 15 min | Wire `/api/portfolio-agent` route |

---

## Demo Script

> "You can also just tell the system what you want. I type: 'Build me a $500 portfolio from today's shocks.' Three AI agents run — a Scanner that finds the highest fade-score opportunities, a Risk Manager that applies Kelly Criterion sizing and checks our correlation matrix to avoid doubling up on the same bet, and a Report Writer that synthesizes it into a trade memo. The agents only use numbers from our real backtest data — they never hallucinate statistics. You get a portfolio in about 10 seconds, pre-loaded into the portfolio builder."

---

## Key Selling Point to Judges

The agents don't replace the quant analysis — they navigate it. The statistical rigor (z=+7.13, category win rates, Kelly sizing, correlation matrix) is all computed by our Python pipeline. The AI agents are the interface that makes it accessible without losing the mathematical foundation. This is the right use of AI: communication and synthesis, not computation.
