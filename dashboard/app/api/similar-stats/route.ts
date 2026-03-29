import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

const MIN_SAMPLE = 5;

/* ── Simple in-memory cache (serverless-safe via module scope) ── */
interface CacheEntry {
  data: unknown;
  ts: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/* ── Only fetch the fields we actually use ── */
const PROJECTION = {
  _id: 1,
  category: 1,
  abs_delta: 1,
  delta: 1,
  reversion_1h: 1,
  reversion_6h: 1,
  reversion_24h: 1,
};

interface ShockDoc {
  _id: string;
  category: string | null;
  abs_delta: number;
  delta: number;
  reversion_1h: number | null;
  reversion_6h: number | null;
  reversion_24h: number | null;
}

interface DistributionData {
  bin_edges: number[];
  bin_counts: number[];
  percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  mean: number;
  std: number;
  min: number;
  max: number;
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeDistribution(values: number[]): DistributionData | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const binCount = Math.min(19, Math.max(5, Math.ceil(Math.sqrt(values.length))));
  const binEdges: number[] = [];
  for (let i = 0; i <= binCount; i++) {
    binEdges.push(
      Math.round((min - 0.01 + ((max - min + 0.02) * i) / binCount) * 10000) / 10000,
    );
  }

  const binCounts = new Array(binCount).fill(0);
  for (const v of values) {
    let placed = false;
    for (let i = 0; i < binCount; i++) {
      if (v >= binEdges[i] && v < binEdges[i + 1]) {
        binCounts[i]++;
        placed = true;
        break;
      }
    }
    if (!placed) binCounts[binCount - 1]++;
  }

  return {
    bin_edges: binEdges,
    bin_counts: binCounts,
    percentiles: {
      p10: Math.round(percentile(sorted, 10) * 10000) / 10000,
      p25: Math.round(percentile(sorted, 25) * 10000) / 10000,
      p50: Math.round(percentile(sorted, 50) * 10000) / 10000,
      p75: Math.round(percentile(sorted, 75) * 10000) / 10000,
      p90: Math.round(percentile(sorted, 90) * 10000) / 10000,
    },
    mean: Math.round(mean * 10000) / 10000,
    std: Math.round(std * 10000) / 10000,
    min: Math.round(min * 10000) / 10000,
    max: Math.round(max * 10000) / 10000,
  };
}

function computeBacktest(shocks: ShockDoc[]) {
  const result: {
    win_rate_1h: number | null;
    win_rate_6h: number | null;
    win_rate_24h: number | null;
    avg_pnl_per_dollar_6h: number;
    max_drawdown_6h: number;
    total_trades: number;
    by_category: Record<string, { win_rate_6h: number; avg_pnl_6h: number; sample_size: number }>;
  } = {
    win_rate_1h: null,
    win_rate_6h: null,
    win_rate_24h: null,
    avg_pnl_per_dollar_6h: 0,
    max_drawdown_6h: 0,
    total_trades: 0,
    by_category: {},
  };

  for (const h of ["1h", "6h", "24h"] as const) {
    const key = `reversion_${h}` as keyof ShockDoc;
    const vals = shocks
      .map((s) => s[key] as number | null)
      .filter((v): v is number => v !== null);
    if (vals.length > 0) {
      const winRate = vals.filter((v) => v > 0).length / vals.length;
      result[`win_rate_${h}`] = Math.round(winRate * 10000) / 10000;
      if (h === "6h") {
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        result.avg_pnl_per_dollar_6h = Math.round(mean * 10000) / 10000;
        result.max_drawdown_6h = Math.round(Math.min(...vals) * 10000) / 10000;
        result.total_trades = vals.length;
      }
    }
  }

  // By category breakdown
  const categories = new Set(shocks.map((s) => s.category).filter(Boolean) as string[]);
  for (const cat of categories) {
    const catShocks = shocks.filter((s) => s.category === cat);
    const vals = catShocks
      .map((s) => s.reversion_6h)
      .filter((v): v is number => v !== null);
    if (vals.length > 0) {
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      result.by_category[cat] = {
        win_rate_6h: Math.round((vals.filter((v) => v > 0).length / vals.length) * 10000) / 10000,
        avg_pnl_6h: Math.round(mean * 10000) / 10000,
        sample_size: vals.length,
      };
    }
  }

  return result;
}

/**
 * Fetch all shock docs (projected) with a 30s in-memory cache.
 * shock_events is a small collection (hundreds–low thousands), so one
 * lightweight query + JS filtering beats up to 3 sequential Mongo queries.
 */
async function getAllShocks(): Promise<ShockDoc[]> {
  const KEY = "all_shocks";
  const hit = cache.get(KEY);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data as ShockDoc[];

  const client = await clientPromise;
  const db = client.db("shocktest");
  const docs = (await db
    .collection("shock_events")
    .find({}, { projection: PROJECTION })
    .toArray()) as unknown as ShockDoc[];

  cache.set(KEY, { data: docs, ts: Date.now() });
  return docs;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const absDelta = parseFloat(url.searchParams.get("abs_delta") ?? "0");
    const deltaSign = url.searchParams.get("direction"); // "up" or "down"
    const excludeId = url.searchParams.get("exclude_id");

    if (!absDelta) {
      return NextResponse.json({ error: "abs_delta is required" }, { status: 400 });
    }

    /* One cached fetch, then filter in JS (avoids up to 3 Mongo round-trips) */
    const all = await getAllShocks();
    const eligible = excludeId
      ? all.filter((s) => String(s._id) !== excludeId)
      : all;

    const loMag = absDelta * 0.7;
    const hiMag = absDelta * 1.3;
    const dirPositive = deltaSign === "up";
    const dirNegative = deltaSign === "down";

    // Level 1 — tight: category + magnitude ±30% + direction
    let shocks = eligible.filter(
      (s) =>
        s.abs_delta >= loMag &&
        s.abs_delta <= hiMag &&
        (!category || s.category === category) &&
        (!dirPositive || s.delta > 0) &&
        (!dirNegative || s.delta < 0),
    );
    let filterLevel: "tight" | "category" | "all" = "tight";

    // Level 2 — category only
    if (shocks.length < MIN_SAMPLE && category) {
      shocks = eligible.filter((s) => s.category === category);
      filterLevel = "category";
    }

    // Level 3 — all
    if (shocks.length < MIN_SAMPLE) {
      shocks = eligible;
      filterLevel = "all";
    }

    const backtest = computeBacktest(shocks);

    // Compute distributions per horizon
    const distributions: Record<string, DistributionData | null> = {};
    for (const h of ["1h", "6h", "24h"] as const) {
      const key = `reversion_${h}` as keyof ShockDoc;
      const vals = shocks
        .map((s) => s[key] as number | null)
        .filter((v): v is number => v !== null);
      distributions[h] = computeDistribution(vals);
    }

    return NextResponse.json(
      {
        backtest,
        distribution_1h: distributions["1h"],
        distribution_6h: distributions["6h"],
        distribution_24h: distributions["24h"],
        sample_size: shocks.length,
        filter_level: filterLevel,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch {
    // DB connection failed — serve dummy similar stats
    const { DUMMY_SIMILAR_STATS } = await import("@/lib/dummyData");
    return NextResponse.json(DUMMY_SIMILAR_STATS);
  }
}
