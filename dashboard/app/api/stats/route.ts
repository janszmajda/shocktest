import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { DUMMY_STATS } from "@/lib/dummyData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("shocktest");

    const [stats, liveMarketCount] = await Promise.all([
      db
        .collection("shock_results")
        .findOne({ _id: "aggregate_stats" as unknown as import("mongodb").ObjectId }),
      db.collection("market_series").countDocuments(),
    ]);

    if (!stats || (stats.total_shocks === 0 && liveMarketCount === 0)) {
      return NextResponse.json(DUMMY_STATS, {
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
      });
    }

    const result = stats;
    // Use live count from market_series (actual tracked markets)
    result.total_markets = liveMarketCount;
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch {
    // DB connection failed — serve dummy stats
    return NextResponse.json(DUMMY_STATS, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  }
}
