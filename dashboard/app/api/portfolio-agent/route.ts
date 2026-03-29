import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const K2_URL = "https://api.k2think.ai/v1/chat/completions";
const K2_MODEL = "MBZUAI-IFM/K2-Think-v2";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShockInput {
  shock_id: string;
  market_id: string;
  question: string;
  category: string | null;
  delta: number;
  abs_delta: number;
  p_after: number;
  p_before: number;
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
  current_price: number | null;
  size: number;
  kelly_fraction: number;
  rationale: string;
}

interface PortfolioOutput {
  allocations: Allocation[];
  total_deployed: number;
  expected_pnl: number;
  portfolio_note: string;
}

// ── K2 client ────────────────────────────────────────────────────────────────

async function callK2(prompt: string): Promise<string> {
  const apiKey = process.env.K2_API_KEY;
  if (!apiKey) throw new Error("K2_API_KEY not set");

  console.log(`[K2] prompt (${prompt.length} chars):\n${prompt}`);

  const res = await fetch(K2_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: K2_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`K2 API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = data.choices?.[0]?.message?.content ?? "";
  const thinkEnd = raw.lastIndexOf("</think>");
  if (thinkEnd !== -1) {
    return raw.slice(thinkEnd + 8).trim();
  }
  return raw.trim();
}

function extractJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch { /* continue */ }
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) return JSON.parse(codeBlock[1]) as T;
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return JSON.parse(match[1]) as T;
  throw new Error("No JSON found");
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const body = (await req.json()) as {
      bankroll?: number;
      shocks?: ShockInput[];
    };
    const bankroll = body.bankroll ?? 500;
    const frontendShocks = body.shocks ?? [];

    console.log(`[/api/portfolio-agent] started: bankroll=$${bankroll}, ${frontendShocks.length} shocks`);

    if (frontendShocks.length === 0) {
      console.log(`[/api/portfolio-agent] no shocks provided`);
      return NextResponse.json({ error: "No shocks provided" }, { status: 400 });
    }

    // Fetch category stats from MongoDB (historical data for edge calculation)
    const client = await clientPromise;
    const db = client.db("shocktest");
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

    // Agent 1 — Scanner + Risk Manager (uses ONLY the shocks from the frontend)
    const analysisPrompt = `You are a quantitative portfolio builder for ShockTest, a Polymarket fade trading tool.

BACKGROUND:
- ShockTest has backtested 1,337 shocks across 107 markets
- 59.9% of shocks revert within 6h (z=+7.13, p<0.001)
- Category win rates: politics 64.7% (significant), science 60.6%, sports 56.1%, other 53.9%, crypto 53.5%

TASK:
1. You MUST ONLY use the shocks listed below. Do NOT invent or reference any markets not in this list.
2. Pick the best 3-4 fade candidates from this list (MAXIMUM 4 positions). Prioritize by category win rate and shock magnitude.
3. Size positions using half-Kelly: position_size = bankroll * (2 * category_win_rate - 1) / 2
4. Cap any single position at 30% of bankroll. Total should deploy 85-95% of bankroll.

BANKROLL: $${bankroll}

AVAILABLE SHOCKS (you may ONLY use these):
${JSON.stringify(frontendShocks.map((s) => ({
  shock_id: s.shock_id,
  market_id: s.market_id,
  question: s.question,
  category: s.category,
  delta_pp: (s.delta * 100).toFixed(1) + "pp",
  delta: s.delta,
  p_before_pct: (s.p_before * 100).toFixed(1) + "%",
  p_after_pct: (s.p_after * 100).toFixed(1) + "%",
  p_after: s.p_after,
})), null, 2)}

CATEGORY STATS:
${JSON.stringify(categoryStats, null, 2)}

Note on fade direction: if delta is positive (price spiked UP), the fade trade is BUY NO. If delta is negative (price dropped), the fade trade is BUY YES.

Respond with ONLY a valid JSON object (no other text):
{"allocations":[{"shock_id":"...","market_id":"...","question":"...","category":"...","delta":0.0,"p_after":0.0,"current_price":null,"size":100,"kelly_fraction":0.15,"rationale":"1-2 sentences on why this is a good fade based on the data"}],"total_deployed":450,"expected_pnl":15.5,"portfolio_note":"1 sentence on diversification"}`;

    console.log(`[/api/portfolio-agent] calling K2 agent 1 (scanner)... ${Date.now() - t0}ms`);
    const analysisRaw = await callK2(analysisPrompt);
    console.log(`[/api/portfolio-agent] agent 1 done: ${Date.now() - t0}ms, response length: ${analysisRaw.length}`);

    let portfolio: PortfolioOutput = { allocations: [], total_deployed: 0, expected_pnl: 0, portfolio_note: "" };
    try {
      const parsed = extractJson<PortfolioOutput>(analysisRaw);
      if (parsed && typeof parsed === "object" && "allocations" in parsed) {
        portfolio = parsed;
        console.log(`[/api/portfolio-agent] parsed ${portfolio.allocations.length} allocations, $${portfolio.total_deployed} deployed`);
      }
    } catch (parseErr) {
      console.log(`[/api/portfolio-agent] JSON parse failed: ${parseErr instanceof Error ? parseErr.message : parseErr}`);
      return NextResponse.json({ report: analysisRaw, allocations: [], portfolio_stats: {} });
    }

    // Agent 2 — Report Writer
    const reportPrompt = `Write a concise trade memo for this portfolio. Format:

FADE PORTFOLIO — $${portfolio.total_deployed} · ${portfolio.allocations.length} positions

For each position:
[N] [direction] [question, max 60 chars] | $[size] | Entry: [p_after as cents]¢
  Thesis: [rationale from the allocation — 1-2 sentences]
  Risk: [main failure mode — 1 sentence]

End with:
PORTFOLIO SUMMARY
  Total deployed: $[amount]
  Expected P&L: +$[amount]
  [portfolio_note]

Data:
${JSON.stringify(portfolio, null, 2)}

Write only the memo, no other text.`;

    console.log(`[/api/portfolio-agent] calling K2 agent 2 (report writer)... ${Date.now() - t0}ms`);
    const report = await callK2(reportPrompt);
    console.log(`[/api/portfolio-agent] agent 2 done: ${Date.now() - t0}ms, report length: ${report.length}`);

    console.log(`[/api/portfolio-agent] complete: ${Date.now() - t0}ms`);
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
    console.error(`[/api/portfolio-agent] error at ${Date.now() - t0}ms:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
