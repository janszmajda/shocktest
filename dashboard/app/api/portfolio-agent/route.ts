import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // K2 reasoning can take time

const K2_URL = "https://api.k2think.ai/v1/chat/completions";
const K2_MODEL = "MBZUAI-IFM/K2-Think-v2";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShockContext {
  shock_id: string;
  market_id: string;
  question: string;
  category: string | null;
  delta: number;
  abs_delta: number;
  p_after: number;
  hours_ago: number | null;
  fade_score?: number;
  rationale?: string;
}

interface CategoryStat {
  win_rate_6h: number | null;
  mean_reversion_6h: number | null;
  sample_size: number | null;
  z_stat: number | null;
  significant_p05: boolean | null;
}

interface Allocation {
  shock_id: string;
  market_id: string;
  question: string;
  category: string | null;
  delta: number;
  p_after: number;
  size: number;
  kelly_fraction: number;
  fade_score?: number;
  rationale: string;
}

interface RiskOutput {
  allocations: Allocation[];
  total_deployed: number;
  expected_pnl: number;
  portfolio_note: string;
}

// ── K2 client ─────────────────────────────────────────────────────────────────

async function callK2(messages: Array<{ role: string; content: string }>): Promise<string> {
  const apiKey = process.env.K2_API_KEY;
  if (!apiKey) throw new Error("K2_API_KEY not set");

  const userMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  console.log(`[K2 prompt]\n${userMsg}`);

  const res = await fetch(K2_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: K2_MODEL, messages, stream: false }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`K2 API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  let content = data.choices[0].message.content;
  // K2 Think V2: reasoning is plain text ending with </think>, answer follows
  const thinkEnd = content.indexOf("</think>");
  if (thinkEnd !== -1) content = content.slice(thinkEnd + 8).trim();
  return content;
}

function extractJson<T>(text: string): T {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return JSON.parse(match[1]) as T;
  return JSON.parse(text) as T;
}

// ── MongoDB context ───────────────────────────────────────────────────────────

async function fetchContext(bankroll: number) {
  const client = await clientPromise;
  const db = client.db("shocktest");

  // Recent shocks — prefer live signals, fall back to latest
  let shocks = await db
    .collection("shock_events")
    .find({ is_recent: true, abs_delta: { $gte: 0.05 } })
    .sort({ abs_delta: -1 })
    .limit(15)
    .toArray();

  if (shocks.length === 0) {
    shocks = await db.collection("shock_events").find({}).sort({ t2: -1 }).limit(15).toArray();
  }

  const stats = await db
    .collection("shock_results")
    .findOne({ _id: "aggregate_stats" as unknown as import("mongodb").ObjectId });

  const byCategory = (stats?.by_category ?? {}) as Record<string, {
    reversion_rate_6h: number | null;
    mean_reversion_6h: number | null;
    sample_size_6h: number | null;
  }>;
  const sig = ((stats?.significance as { by_category_6h?: Record<string, { z_stat: number; significant_vs_50pct: boolean }> })?.by_category_6h ?? {});

  const categoryStats: Record<string, CategoryStat> = {};
  for (const [cat, d] of Object.entries(byCategory)) {
    categoryStats[cat] = {
      win_rate_6h: d.reversion_rate_6h,
      mean_reversion_6h: d.mean_reversion_6h,
      sample_size: d.sample_size_6h,
      z_stat: sig[cat]?.z_stat ?? null,
      significant_p05: sig[cat]?.significant_vs_50pct ?? null,
    };
  }

  const recentShocks: ShockContext[] = shocks.map((s) => ({
    shock_id: String(s._id),
    market_id: String(s.market_id),
    question: String(s.question),
    category: (s.category as string | null) ?? null,
    delta: Number(s.delta),
    abs_delta: Number(s.abs_delta),
    p_after: Number(s.p_after),
    hours_ago: s.hours_ago != null ? Number(s.hours_ago) : null,
  }));

  return { bankroll, recentShocks, categoryStats, overallWinRate: stats?.reversion_rate_6h ?? null };
}

// ── Agent prompts ─────────────────────────────────────────────────────────────

const SCANNER_PROMPT = `You are a quantitative signal scanner for ShockTest, a Polymarket trading tool.

ShockTest has backtested 1,337 shocks across 107 markets.
Key finding: 59.9% of shocks revert within 6h (z=+7.13, p<0.001).

Category win rates at 6h:
- politics: 64.7% (statistically significant)
- science:  60.6%
- sports:   56.1%
- other:    53.9%
- crypto:   53.5%

Pick the top 3-5 fade candidates. Score on: category win rate, shock size, recency.
Respond with ONLY a valid JSON array, no other text:
[{"shock_id":"...","market_id":"...","question":"...","category":"...","delta":0,"p_after":0,"hours_ago":0,"fade_score":75,"rationale":"..."}]`;

const RISK_PROMPT = `You are a risk manager for a prediction market trading desk.

Size the portfolio using half-Kelly: position_size = bankroll * (2 * win_rate - 1) / 2
Cap any single position at 30% of bankroll. Total should use 85-95% of bankroll.

Respond with ONLY a valid JSON object, no other text:
{"allocations":[{"shock_id":"...","market_id":"...","question":"...","category":"...","delta":0,"p_after":0,"size":150,"kelly_fraction":0.15,"rationale":"..."}],"total_deployed":450,"expected_pnl":15.5,"portfolio_note":"..."}`;

const REPORT_PROMPT = `You are a trade desk analyst writing a concise portfolio memo.

Format:
FADE PORTFOLIO — $[total] · [N] positions

[1/N] [question truncated to 60 chars] | $[size] | Entry: [p_after*100]¢ | Score: [fade_score]/100
  Thesis: [why revert — 1-2 sentences using real win rate numbers]
  Risk: [main failure mode — 1 sentence]

PORTFOLIO SUMMARY
  Total deployed: $[amount]
  Expected P&L: +$[amount]
  [diversification note]

⚠️ In-sample backtest only. Not investment advice.`;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { bankroll?: number };
    const bankroll = body.bankroll ?? 500;

    const context = await fetchContext(bankroll);

    // Agent 1 — Scanner
    const scannerRaw = await callK2([
      { role: "system", content: SCANNER_PROMPT },
      {
        role: "user",
        content: `Recent shocks:\n${JSON.stringify(context.recentShocks, null, 2)}\n\nCategory stats:\n${JSON.stringify(context.categoryStats, null, 2)}\n\nBankroll: $${bankroll}`,
      },
    ]);

    let candidates: ShockContext[] = [];
    try {
      const parsed = extractJson<ShockContext[]>(scannerRaw);
      candidates = Array.isArray(parsed) ? parsed : [];
    } catch {
      candidates = [];
    }

    // Agent 2 — Risk Manager
    const riskRaw = await callK2([
      { role: "system", content: RISK_PROMPT },
      {
        role: "user",
        content: `Bankroll: $${bankroll}\n\nCandidates:\n${JSON.stringify(candidates, null, 2)}\n\nCategory stats:\n${JSON.stringify(context.categoryStats, null, 2)}`,
      },
    ]);

    let portfolio: RiskOutput = { allocations: [], total_deployed: 0, expected_pnl: 0, portfolio_note: "" };
    try {
      const parsed = extractJson<RiskOutput>(riskRaw);
      if (parsed && typeof parsed === "object" && "allocations" in parsed) {
        portfolio = parsed;
      }
    } catch {
      portfolio = { allocations: [], total_deployed: 0, expected_pnl: 0, portfolio_note: "" };
    }

    // Agent 3 — Report Writer
    const report = await callK2([
      { role: "system", content: REPORT_PROMPT },
      { role: "user", content: `Write the trade memo:\n${JSON.stringify(portfolio, null, 2)}` },
    ]);

    return NextResponse.json({
      report,
      allocations: portfolio.allocations,
      portfolio_stats: {
        total_deployed: portfolio.total_deployed,
        expected_pnl: portfolio.expected_pnl,
        portfolio_note: portfolio.portfolio_note,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
