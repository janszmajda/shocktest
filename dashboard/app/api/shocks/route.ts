import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("shocktest");

    const shocks = await db
      .collection("shock_events")
      .find({})
      .sort({ abs_delta: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json(shocks);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch shocks" },
      { status: 500 },
    );
  }
}
