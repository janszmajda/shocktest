import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { DUMMY_BACKTEST } from "@/lib/dummyData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("shocktest");

    const stats = await db
      .collection("shock_results")
      .findOne({ _id: "aggregate_stats" as unknown as import("mongodb").ObjectId });

    if (!stats) {
      return NextResponse.json(DUMMY_BACKTEST);
    }

    return NextResponse.json({
      backtest: stats.backtest || null,
      distribution_1h: stats.distribution_1h || null,
      distribution_6h: stats.distribution_6h || null,
      distribution_24h: stats.distribution_24h || null,
    });
  } catch {
    // DB connection failed — serve dummy backtest
    return NextResponse.json(DUMMY_BACKTEST);
  }
}
