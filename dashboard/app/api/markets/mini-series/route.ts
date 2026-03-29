import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/**
 * GET /api/markets/mini-series?ids=id1,id2,...
 * Returns the last ~25% of the price series, close_time, and image_url
 * for each requested market.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");
    if (!idsParam) {
      return NextResponse.json({});
    }

    const ids = idsParam.split(",").filter(Boolean).slice(0, 50);

    const client = await clientPromise;
    const db = client.db("shocktest");

    const markets = await db
      .collection("market_series")
      .find({ market_id: { $in: ids } })
      .project({ market_id: 1, series: 1, close_time: 1, image_url: 1 })
      .toArray();

    const result: Record<
      string,
      {
        series: { t: number; p: number }[];
        close_time: number | null;
        image_url: string | null;
      }
    > = {};
    for (const m of markets) {
      const full = m.series ?? [];
      if (full.length === 0) continue;
      const sliceStart = Math.max(
        0,
        full.length - Math.max(Math.floor(full.length / 4), 20),
      );
      result[m.market_id] = {
        series: full.slice(sliceStart),
        close_time: m.close_time ?? null,
        image_url: m.image_url ?? null,
      };
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch mini series" },
      { status: 500 },
    );
  }
}
