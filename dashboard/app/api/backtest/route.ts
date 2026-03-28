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

    if (!stats) {
      return NextResponse.json(
        { error: "No backtest data yet" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      backtest: stats.backtest || null,
      distribution_1h: stats.distribution_1h || null,
      distribution_6h: stats.distribution_6h || null,
      distribution_24h: stats.distribution_24h || null,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch backtest data" },
      { status: 500 },
    );
  }
}
