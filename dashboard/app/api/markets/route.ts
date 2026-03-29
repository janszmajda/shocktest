import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { DUMMY_SHOCKS, DUMMY_PRICE_SERIES } from "@/lib/dummyData";

export const dynamic = "force-dynamic";

function buildDummyMarket(marketId: string) {
  const shock = DUMMY_SHOCKS.find((s) => s.market_id === marketId);
  if (!shock) return null;
  return {
    market_id: shock.market_id,
    source: shock.source,
    question: shock.question,
    category: shock.category,
    volume: 50000 + Math.floor(Math.random() * 200000),
    close_time: null,
    token_id: null,
    series: DUMMY_PRICE_SERIES,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get("id");

    const client = await clientPromise;
    const db = client.db("shocktest");

    const cacheHeaders = {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    };

    if (marketId) {
      const market = await db
        .collection("market_series")
        .findOne({ market_id: marketId });
      if (!market) {
        // Fall back to dummy market for dummy shock market IDs
        const dummy = buildDummyMarket(marketId);
        return NextResponse.json(dummy, { headers: cacheHeaders });
      }
      return NextResponse.json(market, { headers: cacheHeaders });
    }

    const markets = await db
      .collection("market_series")
      .find({})
      .project({ market_id: 1, source: 1, question: 1, category: 1, volume: 1, close_time: 1, token_id: 1 })
      .toArray();

    if (markets.length === 0) {
      const dummyMarkets = DUMMY_SHOCKS.map((s) => ({
        market_id: s.market_id,
        source: s.source,
        question: s.question,
        category: s.category,
        volume: 50000,
        close_time: null,
        token_id: null,
      }));
      return NextResponse.json(dummyMarkets, { headers: cacheHeaders });
    }

    return NextResponse.json(markets, { headers: cacheHeaders });
  } catch {
    // DB connection failed — serve dummy markets
    const dummyMarkets = DUMMY_SHOCKS.map((s) => ({
      market_id: s.market_id,
      source: s.source,
      question: s.question,
      category: s.category,
      volume: 50000,
      close_time: null,
      token_id: null,
    }));
    return NextResponse.json(dummyMarkets);
  }
}
