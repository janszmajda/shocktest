"""Clean and normalize all time series in MongoDB market_series collection.

Ensures:
- Timestamps are unix seconds (float)
- Prices are float 0-1
- No duplicate timestamps
- Sorted by time ascending
- Markets with <10 data points are flagged
"""

import os
import sys

import pandas as pd
from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGODB_URI", "")

if not MONGO_URI:
    print("ERROR: MONGODB_URI environment variable not set.")
    sys.exit(1)

client: MongoClient = MongoClient(MONGO_URI)
db = client["shocktest"]


def clean_series(series: list[dict], source: str) -> tuple[list[dict], dict]:
    """Clean a single market's time series. Returns (cleaned_series, stats)."""
    if len(series) < 2:
        return series, {"points": len(series), "status": "too_short"}

    df = pd.DataFrame(series)

    # Ensure timestamps are numeric unix seconds
    if isinstance(df["t"].iloc[0], str):
        df["t"] = pd.to_datetime(df["t"]).astype("int64") // 10**9

    df["t"] = df["t"].astype(float)

    # Manifold timestamps might still be in milliseconds if fetched outside our script
    if df["t"].min() > 1e12:
        df["t"] = df["t"] / 1000.0

    # Ensure prices are float 0-1
    df["p"] = df["p"].astype(float)
    if df["p"].max() > 1:
        df["p"] = df["p"] / 100.0

    # Clamp prices to valid range
    df["p"] = df["p"].clip(0.0, 1.0)

    # Remove duplicates and sort
    before_dedup = len(df)
    df = df.drop_duplicates(subset=["t"]).sort_values("t").reset_index(drop=True)
    dupes_removed = before_dedup - len(df)

    # Compute quality stats
    time_range_hrs = (df["t"].max() - df["t"].min()) / 3600
    avg_gap_min = df["t"].diff().mean() / 60 if len(df) > 1 else 0

    stats = {
        "points": len(df),
        "dupes_removed": dupes_removed,
        "time_range_hrs": round(time_range_hrs, 1),
        "avg_gap_min": round(avg_gap_min, 1),
        "status": "ok",
    }

    cleaned = [{"t": row["t"], "p": round(row["p"], 6)} for _, row in df.iterrows()]
    return cleaned, stats


def main() -> None:
    """Process all markets in MongoDB."""
    markets = list(db["market_series"].find({}))
    print(f"Processing {len(markets)} markets...\n")

    ok = 0
    skipped = 0
    updated = 0

    for market in markets:
        mid = market.get("market_id", "unknown")[:50]
        source = market.get("source", "unknown")
        series = market.get("series", [])

        if len(series) < 10:
            print(f"  SKIP {mid}: only {len(series)} points")
            skipped += 1
            continue

        cleaned, stats = clean_series(series, source)

        dupes_msg = f", -{stats['dupes_removed']} dupes" if stats["dupes_removed"] else ""
        print(
            f"  {source[:4]:4s} {mid[:45]:45s} "
            f"{stats['points']:5d} pts, "
            f"{stats['time_range_hrs']:6.1f}h, "
            f"~{stats['avg_gap_min']:.1f}min gap"
            f"{dupes_msg}"
        )

        # Update MongoDB with cleaned series
        db["market_series"].update_one(
            {"_id": market["_id"]},
            {"$set": {"series": cleaned}},
        )
        updated += 1
        ok += 1

    # Summary
    print("\n=== Resample complete ===")
    print(f"  OK: {ok}  |  Skipped (<10 pts): {skipped}  |  Updated: {updated}")
    print(f"  Total markets in DB: {db['market_series'].count_documents({})}")


if __name__ == "__main__":
    main()
