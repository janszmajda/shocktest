"""
Master pipeline script for ShockTest analysis.

Runs the full analysis in order:
  1. Shock detection      → shock_events collection
  2. Post-shock outcomes  → updates shock_events with reversion fields
  3. Gemini categorization → updates market_series + shock_events with category
  4. Aggregate statistics  → shock_results collection

Usage:
    python analysis/run_all.py                    # full pipeline
    python analysis/run_all.py --skip-categorize  # skip Gemini (use cached categories)
    python analysis/run_all.py --skip-detect      # skip detection (re-run analysis only)
    python analysis/run_all.py --loop 120         # re-run every 120 seconds
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from analysis.aggregate import compute_aggregate_stats
from analysis.categorize import categorize_all_markets
from analysis.helpers import get_db
from analysis.post_shock import run_all_post_shock_analysis
from analysis.shock_detector import run_detection


def run_all(skip_detect: bool = False, skip_categorize: bool = False) -> None:
    db = get_db()

    print("=" * 60)
    print("SHOCKTEST ANALYSIS PIPELINE")
    print("=" * 60)

    # Step 1: Shock detection
    if skip_detect:
        n_shocks = db["shock_events"].count_documents({})
        print(f"\n[1/4] SKIPPING detection — using {n_shocks} existing shocks")
    else:
        print("\n[1/4] Running shock detection...")
        n_shocks = run_detection(theta=0.08)
        print(f"      => {n_shocks} shocks detected")

    if n_shocks == 0:
        print("No shocks found — stopping pipeline.")
        return

    # Step 2: Post-shock outcomes
    print("\n[2/4] Computing post-shock outcomes...")
    updated = run_all_post_shock_analysis()
    print(f"      => {updated} shocks updated with reversion data")

    # Step 3: Gemini categorization
    if skip_categorize:
        categorized = db["market_series"].count_documents({"category": {"$ne": None}})
        print(f"\n[3/4] SKIPPING categorization — {categorized} markets already categorized")
    else:
        print("\n[3/4] Running Gemini categorization...")
        categorize_all_markets()

    # Step 4: Aggregate stats
    print("\n[4/4] Computing aggregate statistics...")
    compute_aggregate_stats()

    print("\n" + "=" * 60)
    print("Pipeline complete.")
    print(f"  shock_events:  {db['shock_events'].count_documents({})} docs")
    print(f"  shock_results: {db['shock_results'].count_documents({})} docs")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run full ShockTest analysis pipeline")
    parser.add_argument("--skip-detect", action="store_true", help="Skip shock detection")
    parser.add_argument("--skip-categorize", action="store_true", help="Skip Gemini categorization")
    parser.add_argument(
        "--loop", type=int, metavar="SECONDS", default=0, help="Re-run pipeline every N seconds (e.g. --loop 120)"
    )
    args = parser.parse_args()

    run_all(skip_detect=args.skip_detect, skip_categorize=args.skip_categorize)

    if args.loop > 0:
        while True:
            print(f"\nSleeping {args.loop}s before next run...")
            time.sleep(args.loop)
            run_all(skip_detect=args.skip_detect, skip_categorize=args.skip_categorize)
