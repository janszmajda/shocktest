"""
Multi-agent portfolio construction for ShockTest using K2 Think V2.

Three agents run in sequence:
  1. Scanner   — finds best fade opportunities from recent shocks
  2. Risk Mgr  — applies Kelly sizing and diversification constraints
  3. Reporter  — writes a plain-English trade memo

Requires K2_API_KEY in .env

Usage:
    python analysis/agents.py
    python analysis/agents.py --bankroll 1000
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# Fix Windows console encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

import requests
from dotenv import load_dotenv

from analysis.helpers import get_db

load_dotenv()

K2_URL = "https://api.k2think.ai/v1/chat/completions"
K2_MODEL = "MBZUAI-IFM/K2-Think-v2"


# ── K2 client ────────────────────────────────────────────────────────────────


def call_k2(messages: list[dict], api_key: str) -> str:
    """
    Call K2 Think V2 and return the response text.
    K2 outputs reasoning inline — we return the full content for extraction.
    """
    user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    print(f"\n  [K2 prompt] {user_msg[:200]}{'...' if len(user_msg) > 200 else ''}")
    resp = requests.post(
        K2_URL,
        json={"model": K2_MODEL, "messages": messages, "stream": False},
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        timeout=120,
    )
    resp.raise_for_status()
    content: str = resp.json()["choices"][0]["message"]["content"]
    # K2 Think V2 emits reasoning as plain text ending with </think>, then the answer
    if "</think>" in content:
        content = content.split("</think>", 1)[1].strip()
    return content


def extract_json(text: str) -> dict | list:
    """
    Extract JSON from K2's response. K2 Think V2 outputs reasoning inline,
    so we try multiple strategies in order:
      1. ```json ... ``` code block
      2. ``` ... ``` code block (untagged)
      3. Balanced bracket scan from the last [ or { in the text
         (reasoning precedes JSON, so the JSON is usually at the end)
    """
    # Strategy 0: direct parse (works when response is clean JSON after think-stripping)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strategy 1: tagged code block
    m = re.search(r"```json\s*([\s\S]*?)\s*```", text)
    if m:
        return json.loads(m.group(1))

    # Strategy 2: untagged code block
    m = re.search(r"```\s*([\s\S]*?)\s*```", text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # Strategy 3: find the FIRST { or [ and do a balanced scan — that's the outer container.
    # Using find (not rfind) because outermost bracket is earliest in the JSON.
    bracket_positions = [(text.find("{"), "{"), (text.find("["), "[")]
    bracket_positions = [(pos, ch) for pos, ch in bracket_positions if pos != -1]
    for start, _ in sorted(bracket_positions):
        depth = 0
        in_string = False
        escape_next = False
        for i, ch in enumerate(text[start:], start):
            if escape_next:
                escape_next = False
                continue
            if ch == "\\" and in_string:
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch in "{[":
                depth += 1
            elif ch in "}]":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break

    raise ValueError(f"No valid JSON found in response (first 300 chars): {text[:300]}")


# ── MongoDB context ───────────────────────────────────────────────────────────


def fetch_context(bankroll: float) -> dict:
    """Pull all data needed by the agents from MongoDB."""
    db = get_db()

    shocks = list(
        db["shock_events"].find({"is_recent": True, "abs_delta": {"$gte": 0.05}}).sort("abs_delta", -1).limit(15)
    )

    if not shocks:
        # Fall back to most recent shocks if no live signals
        shocks = list(db["shock_events"].find({}).sort("t2", -1).limit(15))

    stats = db["shock_results"].find_one({"_id": "aggregate_stats"})
    by_cat = stats.get("by_category", {}) if stats else {}
    sig = (stats.get("significance", {}).get("by_category_6h", {})) if stats else {}

    return {
        "bankroll": bankroll,
        "recent_shocks": [
            {
                "shock_id": str(s["_id"]),
                "market_id": s["market_id"],
                "question": s["question"],
                "category": s.get("category"),
                "delta": round(float(s["delta"]), 4),
                "abs_delta": round(float(s["abs_delta"]), 4),
                "p_after": round(float(s["p_after"]), 4),
                "hours_ago": s.get("hours_ago"),
                "reversion_6h": s.get("reversion_6h"),
            }
            for s in shocks
        ],
        "category_stats": {
            cat: {
                "win_rate_6h": d.get("reversion_rate_6h"),
                "mean_reversion_6h": d.get("mean_reversion_6h"),
                "sample_size": d.get("sample_size_6h"),
                "z_stat": sig.get(cat, {}).get("z_stat"),
                "significant_p05": sig.get(cat, {}).get("significant_vs_50pct"),
            }
            for cat, d in by_cat.items()
        },
        "overall": {
            "win_rate_6h": stats.get("reversion_rate_6h") if stats else None,
            "mean_reversion_6h": stats.get("mean_reversion_6h") if stats else None,
            "total_shocks": stats.get("total_shocks") if stats else 0,
        },
    }


# ── Agent system prompts ──────────────────────────────────────────────────────

SCANNER_PROMPT = """\
You are a quantitative signal scanner for ShockTest, a Polymarket trading tool.

ShockTest has backtested 1,337 probability shocks across 107 markets.
Key finding: 59.9% of shocks revert within 6h (z=+7.13, p<0.001).

Category win rates at 6h:
- politics: 64.7% (statistically significant, z=+7.72)
- science:  60.6% (not significant — small sample)
- sports:   56.1% (not significant)
- other:    53.9% (not significant)
- crypto:   53.5% (not significant)

Score each shock on:
1. Category win rate (politics best, crypto weakest)
2. Shock size (larger abs_delta = stronger signal, diminishing returns above 0.30)
3. Recency (hours_ago < 3 = strongest, > 12 = weak signal)
4. Whether the category is statistically significant

Pick the top 3-5 candidates. Respond with ONLY a valid JSON array:
[
  {
    "shock_id": "...",
    "market_id": "...",
    "question": "...",
    "category": "...",
    "delta": ...,
    "p_after": ...,
    "hours_ago": ...,
    "fade_score": <0-100 integer>,
    "rationale": "<one concise sentence>"
  }
]"""

RISK_PROMPT = """\
You are a risk manager for a prediction market trading desk.

Given candidate fade positions and a capital budget, size the portfolio:

Kelly formula (half-Kelly recommended):
  full_kelly = 2 * win_rate - 1
  half_kelly = full_kelly / 2
  position_size = bankroll * half_kelly

Rules:
- Use half-Kelly sizing (more conservative, avoids ruin)
- Cap any single position at 30% of bankroll
- Total allocation should use 85-95% of bankroll
- Prefer diversification across categories
- If crypto and another category are both candidates, weight crypto lower

Respond with ONLY a valid JSON object:
{
  "allocations": [
    {
      "shock_id": "...",
      "market_id": "...",
      "question": "...",
      "category": "...",
      "delta": ...,
      "p_after": ...,
      "size": <dollars, integer>,
      "kelly_fraction": <0.0-1.0>,
      "rationale": "<one concise sentence>"
    }
  ],
  "total_deployed": <integer>,
  "expected_pnl": <float, dollars>,
  "portfolio_note": "<one sentence on diversification>"
}"""

REPORT_PROMPT = """\
You are a trade desk analyst writing a concise portfolio memo for a prediction market trader.

Write a professional, specific trade memo. Format it as follows:

FADE PORTFOLIO — $[total] · [N] positions

[For each position:]
[1/N] [SHORT question] | $[size] | Entry: [p_after as %]¢
  Thesis: [why this might revert — 1-2 sentences]
  Risk: [main reason it might NOT revert — 1 sentence]

PORTFOLIO SUMMARY
  Total deployed: $[amount]
  Expected P&L:   +$[amount] ([win_rate]% historical win rate)
  [diversification_note]

⚠️ In-sample backtest only. Ignores transaction costs and slippage. Not investment advice.

Be specific with numbers. Keep each position block under 4 lines."""


# ── Pipeline ──────────────────────────────────────────────────────────────────


def build_portfolio(bankroll: float = 500.0) -> dict:
    """
    Run the 3-agent pipeline and return the portfolio report.

    Returns:
        dict with keys: report (str), allocations (list), portfolio_stats (dict)
    """
    api_key = os.environ.get("K2_API_KEY")
    if not api_key:
        raise EnvironmentError("K2_API_KEY not set — add it to .env")

    print(f"Building ${bankroll:.0f} fade portfolio with K2 Think V2...")
    context = fetch_context(bankroll)
    print(f"  Context: {len(context['recent_shocks'])} recent shocks loaded")

    # Agent 1 — Scanner
    print("  [1/3] Scanner: identifying best candidates...")
    scanner_raw = call_k2(
        [
            {"role": "system", "content": SCANNER_PROMPT},
            {
                "role": "user",
                "content": f"Recent shocks:\n{json.dumps(context['recent_shocks'], indent=2)}\n\nCategory stats:\n{json.dumps(context['category_stats'], indent=2)}\n\nBankroll: ${bankroll}",
            },
        ],
        api_key,
    )
    try:
        candidates = extract_json(scanner_raw)
        if not isinstance(candidates, list):
            candidates = []
        print(f"  [1/3] Scanner: {len(candidates)} candidates identified")
    except Exception as e:
        print(f"  [1/3] Scanner parse error: {e} — using raw output")
        candidates = []

    # Agent 2 — Risk Manager
    print("  [2/3] Risk Manager: sizing positions...")
    risk_raw = call_k2(
        [
            {"role": "system", "content": RISK_PROMPT},
            {
                "role": "user",
                "content": f"Bankroll: ${bankroll}\n\nCandidates:\n{json.dumps(candidates, indent=2)}\n\nCategory stats:\n{json.dumps(context['category_stats'], indent=2)}",
            },
        ],
        api_key,
    )
    try:
        portfolio = extract_json(risk_raw)
        if not isinstance(portfolio, dict):
            portfolio = {}
        allocations = portfolio.get("allocations", [])
        print(f"  [2/3] Risk Manager: {len(allocations)} positions sized, total ${portfolio.get('total_deployed', 0)}")
    except Exception as e:
        print(f"  [2/3] Risk Manager parse error: {e}")
        portfolio = {}
        allocations = []

    # Agent 3 — Report Writer
    print("  [3/3] Report Writer: writing trade memo...")
    report = call_k2(
        [
            {"role": "system", "content": REPORT_PROMPT},
            {
                "role": "user",
                "content": f"Write the trade memo:\n{json.dumps(portfolio, indent=2)}",
            },
        ],
        api_key,
    )
    print("  Done.")

    return {
        "report": report,
        "allocations": allocations,
        "portfolio_stats": {
            "total_deployed": portfolio.get("total_deployed"),
            "expected_pnl": portfolio.get("expected_pnl"),
            "portfolio_note": portfolio.get("portfolio_note"),
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build a K2-powered fade portfolio")
    parser.add_argument("--bankroll", type=float, default=500.0, help="Total capital in dollars")
    args = parser.parse_args()

    result = build_portfolio(args.bankroll)
    print("\n" + "=" * 60)
    print(result["report"])
    print("=" * 60)
    print(f"\nAllocations: {json.dumps(result['allocations'], indent=2)}")
