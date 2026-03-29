"""Flag recent shocks as potentially actionable live signals.

Adds 'is_recent' and 'hours_ago' fields to all shock_events.
Shocks from the last 48h with active markets are flagged — these are
shocks a trader could still act on.
"""

import os
import sys
from datetime import datetime, timezone

from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGODB_URI", "")
if not MONGO_URI:
    print("ERROR: MONGODB_URI not set.")
    sys.exit(1)

db = MongoClient(MONGO_URI)["shocktest"]


def get_current_prices() -> dict[str, float]:
    """Get latest price for each market from market_series."""
    prices: dict[str, float] = {}
    for doc in db["market_series"].find({}, {"market_id": 1, "series": {"$slice": -1}}):
        series = doc.get("series", [])
        if series:
            prices[str(doc["market_id"])] = float(series[-1].get("p", 0.5))
    return prices


def is_resolved(current_price: float) -> bool:
    """Market is likely resolved if price is near 0 or 1."""
    return current_price <= 0.02 or current_price >= 0.98


def main() -> None:
    """Flag shocks from the last 48 hours as recent/live, excluding resolved markets."""
    now = datetime.now(timezone.utc)
    shocks = list(db["shock_events"].find({}))
    current_prices = get_current_prices()
    print(f"Flagging recent shocks ({len(shocks)} total)...\n")

    recent_count = 0
    resolved_count = 0
    for shock in shocks:
        t2_raw = shock.get("t2", "")
        try:
            t2 = datetime.fromisoformat(t2_raw.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            db["shock_events"].update_one(
                {"_id": shock["_id"]},
                {"$set": {"is_recent": False, "hours_ago": None}},
            )
            continue

        hours_ago = (now - t2).total_seconds() / 3600
        market_id = str(shock.get("market_id", ""))
        cp = current_prices.get(market_id)

        # Recent = within 48h AND market not resolved
        resolved = cp is not None and is_resolved(cp)
        is_recent_flag = hours_ago <= 48 and not resolved

        db["shock_events"].update_one(
            {"_id": shock["_id"]},
            {"$set": {"is_recent": is_recent_flag, "hours_ago": round(hours_ago, 1)}},
        )

        if hours_ago <= 48 and resolved:
            resolved_count += 1
        elif is_recent_flag:
            recent_count += 1
            delta = shock.get("delta", 0)
            question = shock.get("question", "")[:50]
            cp_pct = f"{cp * 100:.0f}%" if cp is not None else "?"
            print(f"  LIVE: {question}... ({hours_ago:.0f}h ago, delta={delta:+.2f}, now={cp_pct})")

    print(f"\n{recent_count} recent shocks flagged, {resolved_count} resolved (skipped), {len(shocks)} total")


if __name__ == "__main__":
    main()
