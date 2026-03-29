import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get("id");

    const client = await clientPromise;
    console.log(`[/api/markets${marketId ? `?id=${marketId}` : ""}] mongo connect: ${Date.now() - t0}ms`);

    const db = client.db("shocktest");

    if (marketId) {
      const market = await db
        .collection("market_series")
        .findOne({ market_id: marketId });
      console.log(`[/api/markets?id=${marketId}] query done: ${Date.now() - t0}ms`);
      return NextResponse.json(market);
    }

    const markets = await db
      .collection("market_series")
      .find({})
      .project({ series: 0 })
      .toArray();

    console.log(`[/api/markets] query done: ${Date.now() - t0}ms (${markets.length} docs)`);
    return NextResponse.json(markets);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch markets" },
      { status: 500 },
    );
  }
}
