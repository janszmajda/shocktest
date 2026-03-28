"""
Final validation checklist for ShockTest — run before declaring MVP.

Checks all three collections are populated, aggregate stats are sane,
backtest and distribution data exist, and spot-checks 3 shocks manually.

Usage:
    python analysis/validation_checklist.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from analysis.helpers import get_db, load_market_series

PASS = "[PASS]"
FAIL = "[FAIL]"
WARN = "[WARN]"


def check(label: str, condition: bool, detail: str = "") -> bool:
    status = PASS if condition else FAIL
    print(f"  {status} {label}" + (f" — {detail}" if detail else ""))
    return condition


def run_validation() -> bool:
    db = get_db()
    all_passed = True

    # ── 1. Collection counts ──────────────────────────────────────────────────
    print("\n[1] Collection counts")
    counts = {col: db[col].count_documents({}) for col in ["market_series", "shock_events", "shock_results"]}
    for col, n in counts.items():
        all_passed &= check(f"{col}: {n} docs", n > 0)

    # ── 2. Aggregate stats ────────────────────────────────────────────────────
    print("\n[2] Aggregate stats")
    stats = db["shock_results"].find_one({"_id": "aggregate_stats"})
    all_passed &= check("aggregate_stats doc exists", stats is not None)
    if not stats:
        print("  Cannot continue without aggregate_stats.")
        return False

    rate_6h = stats.get("reversion_rate_6h")
    mean_6h = stats.get("mean_reversion_6h")
    n_6h = stats.get("sample_size_6h", 0)

    all_passed &= check(
        f"reversion_rate_6h = {rate_6h:.1%}",
        rate_6h is not None and 0.40 <= rate_6h <= 0.70,
        "expected 40–70%",
    )
    all_passed &= check(
        f"mean_reversion_6h = {mean_6h:.4f}",
        mean_6h is not None and 0.005 <= mean_6h <= 0.10,
        "expected 0.005–0.10",
    )
    all_passed &= check(f"sample_size_6h = {n_6h}", n_6h >= 100, "expected >= 100")

    # ── 3. Category breakdown ─────────────────────────────────────────────────
    print("\n[3] Category breakdown")
    by_cat = stats.get("by_category", {})
    all_passed &= check("by_category exists", len(by_cat) > 0)
    for cat, data in by_cat.items():
        n = data.get("sample_size_6h", 0)
        rate = data.get("reversion_rate_6h")
        tag = WARN if n < 5 else PASS
        label = f"{cat}: {n} shocks, 6h_rate={rate:.1%}" if rate else f"{cat}: {n} shocks, no 6h rate"
        print(f"  {tag} {label}")

    # ── 4. Backtest data ──────────────────────────────────────────────────────
    print("\n[4] Backtest data")
    backtest = stats.get("backtest")
    all_passed &= check("backtest field exists", backtest is not None)
    if backtest:
        wr = backtest.get("win_rate_6h")
        pnl = backtest.get("avg_pnl_per_dollar_6h")
        all_passed &= check(f"win_rate_6h = {wr:.1%}", wr is not None)
        all_passed &= check(f"avg_pnl_per_dollar_6h = {pnl:.4f}", pnl is not None)

    # ── 5. Distribution data ──────────────────────────────────────────────────
    print("\n[5] Distribution data")
    for h in ["1h", "6h", "24h"]:
        dist = stats.get(f"distribution_{h}")
        all_passed &= check(
            f"distribution_{h} exists",
            dist is not None and "bin_counts" in (dist or {}),
        )
        if dist:
            n_bins = len(dist.get("bin_counts", []))
            pcts = dist.get("percentiles", {})
            check(f"  {h}: {n_bins} bins, p50={pcts.get('p50', 'N/A')}", n_bins > 0)

    # ── 6. Null check on shock_events ─────────────────────────────────────────
    print("\n[6] Null checks on shock_events")
    null_reversion = db["shock_events"].count_documents({"reversion_6h": None})
    total = counts["shock_events"]
    null_pct = null_reversion / total if total else 0
    all_passed &= check(
        f"reversion_6h nulls: {null_reversion}/{total} ({null_pct:.0%})",
        null_pct < 0.10,
        "expected < 10% null",
    )

    null_cat = db["shock_events"].count_documents({"category": None})
    all_passed &= check(
        f"category nulls: {null_cat}/{total}",
        null_cat == 0,
        "all shocks should have a category",
    )

    # ── 7. Spot-check 3 shocks ────────────────────────────────────────────────
    print("\n[7] Spot-check: 3 largest shocks")
    top3 = list(db["shock_events"].find({}).sort("abs_delta", -1).limit(3))
    for shock in top3:
        rev = shock.get("reversion_6h")
        rev_str = f"{rev:+.4f}" if rev is not None else "None"
        try:
            df = load_market_series(shock["market_id"])
            n_points = len(df)
        except Exception:
            n_points = 0
        print(
            f"  {shock.get('question', '')[:50]:<50} "
            f"delta={shock.get('delta', 0):+.4f}  rev_6h={rev_str}  "
            f"series_pts={n_points}"
        )

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    if all_passed:
        print("ALL CHECKS PASSED — MVP data is ready.")
    else:
        print("SOME CHECKS FAILED — fix before declaring MVP.")
    print("=" * 60)

    return all_passed


if __name__ == "__main__":
    run_validation()
