"""
Manual test script for shock detection — Hour 4-6.

Run this to verify shock_detector.py is working correctly across all markets.
Prints detected shocks per market and suggests threshold tuning if sample is small.

Usage:
    python analysis/test_shock_detection.py
"""

from analysis.helpers import get_db
from analysis.shock_detector import find_shocks, run_detection

db = get_db()

market_ids = db["market_series"].distinct("market_id")
print(f"Testing shock detection on {len(market_ids)} markets...")
print()

all_shocks = []
for mid in market_ids:
    shocks = find_shocks(mid, theta=0.08, window_minutes=60)
    if shocks:
        market = db["market_series"].find_one({"market_id": mid}, {"question": 1})
        question = market.get("question", mid)[:60] if market else mid
        print(f"  [{len(shocks)} shocks] {question}")
        for s in shocks:
            print(f"    {s['t1']} -> {s['t2']}  {s['p_before']:.2f} -> {s['p_after']:.2f}  d={s['delta']:+.3f}")
    all_shocks.extend(shocks)

print()
print(f"=== Total shocks found (theta=0.08): {len(all_shocks)} ===")

# Try lower threshold if sample is thin
if len(all_shocks) < 15:
    print("\nToo few shocks at theta=0.08 — trying theta=0.05...")
    all_shocks_05 = []
    for mid in market_ids:
        shocks = find_shocks(mid, theta=0.05, window_minutes=60)
        all_shocks_05.extend(shocks)
    print(f"Total shocks at theta=0.05: {len(all_shocks_05)}")

    if len(all_shocks_05) >= 15:
        print("Use theta=0.05 — re-run detection: run_detection(theta=0.05)")
    else:
        print("Still too few — wait for P1 to load more markets, then re-run.")
else:
    # Enough shocks — write to MongoDB
    print("\nWriting to shock_events...")
    n = run_detection(theta=0.08)
    print(f"Done — {n} shocks in shock_events.")
