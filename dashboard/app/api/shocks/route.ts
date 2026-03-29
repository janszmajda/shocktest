import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();
  try {
    const client = await clientPromise;
    console.log(`[/api/shocks] mongo connect: ${Date.now() - t0}ms`);

    const db = client.db("shocktest");
    const shocks = await db
      .collection("shock_events")
      .find({})
      .sort({ t2: -1 })
      .limit(500)
      .project({
        market_id: 1,
        source: 1,
        question: 1,
        category: 1,
        t1: 1,
        t2: 1,
        p_before: 1,
        p_after: 1,
        delta: 1,
        abs_delta: 1,
        post_move_1h: 1,
        post_move_6h: 1,
        post_move_24h: 1,
        reversion_1h: 1,
        reversion_6h: 1,
        reversion_24h: 1,
        is_recent: 1,
        hours_ago: 1,
        ai_analysis: 1,
      })
      .toArray();

    console.log(`[/api/shocks] query done: ${Date.now() - t0}ms (${shocks.length} docs)`);
    return NextResponse.json(shocks);
  } catch (err) {
    console.error(`[/api/shocks] error at ${Date.now() - t0}ms:`, err);
    return NextResponse.json(
      { error: "Failed to fetch shocks" },
      { status: 500 },
    );
  }
}
