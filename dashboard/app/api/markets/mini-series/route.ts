import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { DUMMY_SHOCKS, DUMMY_PRICE_SERIES } from "@/lib/dummyData";

export const dynamic = "force-dynamic";

function buildDummyMiniSeries(ids: string[]) {
  const dummyIds = new Set(DUMMY_SHOCKS.map((s) => s.market_id));
  const result: Record<
    string,
    { series: { t: number; p: number }[]; close_time: number | null; image_url: string | null }
  > = {};
  for (const id of ids) {
    if (dummyIds.has(id)) {
      const sliceStart = Math.max(0, DUMMY_PRICE_SERIES.length - 40);
      result[id] = {
        series: DUMMY_PRICE_SERIES.slice(sliceStart),
        close_time: null,
        image_url: null,
      };
    }
  }
  return result;
}

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

    // Fill in dummy data for any requested IDs not found in DB
    const missingIds = ids.filter((id) => !result[id]);
    if (missingIds.length > 0) {
      const dummyResult = buildDummyMiniSeries(missingIds);
      Object.assign(result, dummyResult);
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    // DB connection failed — serve dummy mini series
    const { searchParams } = new URL(request.url);
    const ids = (searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 50);
    return NextResponse.json(buildDummyMiniSeries(ids));
  }
}
