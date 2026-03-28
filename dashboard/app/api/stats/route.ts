import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("shocktest");

    const stats = await db
      .collection("shock_results")
      .findOne({ _id: "aggregate_stats" as unknown as import("mongodb").ObjectId });

    return NextResponse.json(
      stats || {
        total_shocks: 0,
        total_markets: 0,
        reversion_rate_1h: null,
        reversion_rate_6h: null,
        reversion_rate_24h: null,
        mean_reversion_6h: null,
        sample_size_6h: 0,
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
