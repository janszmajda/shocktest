import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db("shocktest");

    const showAll = request.nextUrl.searchParams.get("all") === "true";

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const filter = showAll
      ? {}
      : {
          $or: [
            { detected_at: { $gte: oneHourAgo } },
            { t2: { $gte: oneHourAgo } },
          ],
        };

    const raw = await db
      .collection("shock_events")
      .find(filter, {
        projection: {
          market_id: 1, source: 1, question: 1, category: 1,
          t1: 1, t2: 1, p_before: 1, p_after: 1, delta: 1, abs_delta: 1,
          reversion_1h: 1, reversion_6h: 1, reversion_24h: 1,
          post_move_1h: 1, post_move_6h: 1, post_move_24h: 1,
          is_recent: 1, is_live_alert: 1, hours_ago: 1, detected_at: 1,
          ai_analysis: 1, fade_pnl_1h: 1, fade_pnl_6h: 1, fade_pnl_24h: 1,
          historical_win_rate: 1, historical_avg_pnl: 1,
        },
      })
      .sort({ detected_at: -1, t2: -1 })
      .toArray();

    // Strip live/recent flags from resolved markets (price at 0% or 100%)
    const shocks = raw.map((s) => {
      if (s.p_after <= 0.01 || s.p_after >= 0.99) {
        return { ...s, is_live_alert: false, is_recent: false };
      }
      return s;
    });

    return NextResponse.json(shocks, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch shocks" },
      { status: 500 },
    );
  }
}
