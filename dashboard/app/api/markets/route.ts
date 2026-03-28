import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get("id");

    const client = await clientPromise;
    const db = client.db("shocktest");

    if (marketId) {
      const market = await db
        .collection("market_series")
        .findOne({ market_id: marketId });
      return NextResponse.json(market);
    }

    const markets = await db
      .collection("market_series")
      .find({})
      .project({ series: 0 })
      .toArray();

    return NextResponse.json(markets);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch markets" },
      { status: 500 },
    );
  }
}
