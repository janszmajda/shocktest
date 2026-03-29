import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShockContext {
  shock_id: string;
  market_id: string;
  question: string;
  category: string | null;
  delta: number;
  abs_delta: number;
  p_after: number;
  current_price: number | null;
  hours_ago: number | null;
  likely_resolved: boolean;
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

// ── Claude client with web search ────────────────────────────────────────────

async function callClaude(prompt: string, useSearch: boolean = false): Promise<string> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("CLAUDE_API_KEY not set");

  console.log(`[Claude portfolio-agent prompt]\n${prompt}`);

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  };

  if (useSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  }

  const res = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  return data.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("")
    .replace(/<\/?cite[^>]*>/g, "")
    .trim();
}

function extractJson<T>(text: string): T {
  // Try direct parse first
  try {
    return JSON.parse(text) as T;
  } catch { /* continue */ }
  // Try code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) return JSON.parse(codeBlock[1]) as T;
  // Try first { or [
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return JSON.parse(match[1]) as T;
  throw new Error("No JSON found");
}

// ── MongoDB context ───────────────────────────────────────────────────────────

async function fetchContext(bankroll: number) {
  const client = await clientPromise;
  const db = client.db("shocktest");

  // Recent shocks
  let shocks = await db
    .collection("shock_events")
    .find({ is_recent: true, abs_delta: { $gte: 0.05 } })
    .sort({ abs_delta: -1 })
    .limit(30)
    .toArray();

  if (shocks.length === 0) {
    shocks = await db.collection("shock_events").find({}).sort({ t2: -1 }).limit(30).toArray();
  }

  // Get current prices from market_series
  const marketIds = [...new Set(shocks.map((s) => String(s.market_id)))];
  const markets = await db
    .collection("market_series")
    .find({ market_id: { $in: marketIds } })
    .toArray();

  const currentPrices: Record<string, number> = {};
  for (const m of markets) {
    const series = m.series as Array<{ p: number }> | undefined;
    if (series && series.length > 0) {
      currentPrices[String(m.market_id)] = series[series.length - 1].p;
    }
  }

  // Aggregate stats
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

  const recentShocks: ShockContext[] = shocks.map((s) => {
    const mid = String(s.market_id);
    const cp = currentPrices[mid] ?? null;
    const cpPct = cp != null ? cp * 100 : null;
    return {
      shock_id: String(s._id),
      market_id: mid,
      question: String(s.question),
      category: (s.category as string | null) ?? null,
      delta: Number(s.delta),
      abs_delta: Number(s.abs_delta),
      p_after: Number(s.p_after),
      current_price: cp,
      hours_ago: s.hours_ago != null ? Number(s.hours_ago) : null,
      likely_resolved: cpPct != null && (cpPct <= 2 || cpPct >= 98),
    };
  });

  return { bankroll, recentShocks, categoryStats, overallWinRate: stats?.reversion_rate_6h ?? null };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { bankroll?: number };
    const bankroll = body.bankroll ?? 500;

    const context = await fetchContext(bankroll);

    // Agent 1 — Scanner + Risk Manager (with web search)
    const analysisPrompt = `You are a quantitative portfolio builder for ShockTest, a Polymarket fade trading tool.

BACKGROUND:
- ShockTest has backtested 1,337 shocks across 107 markets
- 59.9% of shocks revert within 6h (z=+7.13, p<0.001)
- Category win rates: politics 64.7% (significant), science 60.6%, sports 56.1%, other 53.9%, crypto 53.5%

TASK:
1. Review the shocks below. Use web search to check if any of these markets have recent news that makes them especially good or bad fade candidates.
2. Pick the top 3-5 candidates that are still tradeable. Markets where current_price is near 0% or 100% are likely RESOLVED — skip those and pick markets that are still open.
3. Size positions using half-Kelly: position_size = bankroll * (2 * category_win_rate - 1) / 2
4. Cap any single position at 30% of bankroll. Total should deploy 85-95% of bankroll.
5. If all markets appear resolved, pick the ones that were the best fade opportunities and explain what the trade would have been.

BANKROLL: $${bankroll}

RECENT SHOCKS:
${JSON.stringify(context.recentShocks.map((s) => ({
  ...s,
  p_after_pct: (s.p_after * 100).toFixed(1) + "%",
  current_price_pct: s.current_price != null ? (s.current_price * 100).toFixed(1) + "%" : "unknown",
  delta_pp: (s.delta * 100).toFixed(1) + "pp",
  status: s.likely_resolved ? "RESOLVED — skip" : "OPEN",
})), null, 2)}

CATEGORY STATS:
${JSON.stringify(context.categoryStats, null, 2)}

Note on fade direction: if delta is positive (price spiked UP), the fade trade is BUY NO. If delta is negative (price dropped), the fade trade is BUY YES.

Respond with ONLY a valid JSON object (no other text):
{"allocations":[{"shock_id":"...","market_id":"...","question":"...","category":"...","delta":0.0,"p_after":0.0,"current_price":0.0,"direction":"Buy NO","size":100,"kelly_fraction":0.15,"rationale":"1-2 sentences on why this is a good fade, citing any news found"}],"total_deployed":450,"expected_pnl":15.5,"portfolio_note":"1 sentence on diversification"}`;

    const analysisRaw = await callClaude(analysisPrompt, true);

    let portfolio: PortfolioOutput = { allocations: [], total_deployed: 0, expected_pnl: 0, portfolio_note: "" };
    try {
      const parsed = extractJson<PortfolioOutput>(analysisRaw);
      if (parsed && typeof parsed === "object" && "allocations" in parsed) {
        portfolio = parsed;
      }
    } catch {
      // If JSON extraction fails, return raw text as report
      return NextResponse.json({ report: analysisRaw, allocations: [], portfolio_stats: {} });
    }

    // Agent 2 — Report Writer
    const reportPrompt = `Write a concise trade memo for this portfolio. Format:

FADE PORTFOLIO — $${portfolio.total_deployed} · ${portfolio.allocations.length} positions

For each position:
[N] [direction] [question, max 60 chars] | $[size] | Entry: [p_after as cents]¢ | Now: [current_price as cents]¢
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

    const report = await callClaude(reportPrompt);

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
