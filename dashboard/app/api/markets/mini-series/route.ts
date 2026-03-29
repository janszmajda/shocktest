import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/**
 * GET /api/markets/mini-series?ids=id1,id2,...
 * Returns the last ~25% of the price series and close_time for each requested market.
 * Used for sparkline previews and live status on the dashboard.
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
      .project({ market_id: 1, series: 1, close_time: 1 })
      .toArray();

    const result: Record<
      string,
      { series: { t: number; p: number }[]; close_time: number | null }
    > = {};
    for (const m of markets) {
      const full = m.series ?? [];
      if (full.length === 0) continue;
      // Take the last 25% of the series, minimum 20 points
      const sliceStart = Math.max(
        0,
        full.length - Math.max(Math.floor(full.length / 4), 20),
      );
      result[m.market_id] = {
        series: full.slice(sliceStart),
        close_time: m.close_time ?? null,
      };
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch mini series" },
      { status: 500 },
    );
  }
}
