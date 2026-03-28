"""
Statistical significance and confidence intervals for ShockTest.

Computes:
  - Wilson score 95% CI on reversion win rates (proportion test)
  - Bootstrap 95% CI on mean reversion values
  - One-sample z-test: is win rate significantly > 50%?
  - Per-category significance

Stores results in shock_results["aggregate_stats"]["significance"].

Usage:
    python analysis/significance.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np

from analysis.helpers import get_db

Z_95 = 1.96  # z* for 95% confidence
N_BOOTSTRAP = 10_000
RNG = np.random.default_rng(42)


def wilson_ci(n_success: int, n: int, z: float = Z_95) -> tuple[float, float]:
    """Wilson score confidence interval for a proportion."""
    if n == 0:
        return (0.0, 0.0)
    p = n_success / n
    denom = 1 + z**2 / n
    center = (p + z**2 / (2 * n)) / denom
    margin = (z * np.sqrt(p * (1 - p) / n + z**2 / (4 * n**2))) / denom
    return (round(float(center - margin), 4), round(float(center + margin), 4))


def bootstrap_ci(values: list[float], stat_fn=np.mean, z: float = Z_95) -> tuple[float, float]:
    """Percentile bootstrap 95% CI."""
    arr = np.array(values)
    boots = [stat_fn(RNG.choice(arr, size=len(arr), replace=True)) for _ in range(N_BOOTSTRAP)]
    lo = round(float(np.percentile(boots, 2.5)), 4)
    hi = round(float(np.percentile(boots, 97.5)), 4)
    return (lo, hi)


def z_test_vs_50(n_success: int, n: int) -> tuple[float, bool]:
    """One-sample z-test: H0 = win rate is 50%. Returns (z_stat, significant at p<0.05)."""
    if n == 0:
        return (0.0, False)
    p_hat = n_success / n
    se = np.sqrt(0.5 * 0.5 / n)  # SE under null (p=0.5)
    z_stat = (p_hat - 0.5) / se
    return (round(float(z_stat), 3), bool(abs(z_stat) > Z_95))


def compute_significance(values: list[float], label: str) -> dict:
    """Compute all stats for a list of reversion values."""
    arr = np.array(values)
    n = len(arr)
    n_pos = int(np.sum(arr > 0))
    win_rate = n_pos / n if n else 0.0

    win_rate_ci = wilson_ci(n_pos, n)
    mean_ci = bootstrap_ci(values)
    z_stat, significant = z_test_vs_50(n_pos, n)

    result = {
        "n": n,
        "win_rate": round(win_rate, 4),
        "win_rate_ci_95": list(win_rate_ci),
        "mean_reversion": round(float(arr.mean()), 4),
        "mean_reversion_ci_95": list(mean_ci),
        "z_stat": z_stat,
        "significant_vs_50pct": significant,
    }

    sig_str = "YES ***" if significant else "no"
    print(
        f"  {label:25s}  win={win_rate:.1%} [{win_rate_ci[0]:.1%}, {win_rate_ci[1]:.1%}]"
        f"  mean={arr.mean():.4f} [{mean_ci[0]:.4f}, {mean_ci[1]:.4f}]"
        f"  z={z_stat:+.2f}  sig>{50}%: {sig_str}"
    )
    return result


def run_significance_analysis() -> dict:
    db = get_db()
    shocks = list(db["shock_events"].find({}))
    print(f"Loaded {len(shocks)} shocks\n")

    significance: dict = {}

    # ── Overall by horizon ────────────────────────────────────────────────
    print("Overall significance by horizon:")
    for h in ["1h", "6h", "24h"]:
        vals = [s[f"reversion_{h}"] for s in shocks if s.get(f"reversion_{h}") is not None]
        significance[f"overall_{h}"] = compute_significance(vals, f"overall {h}")

    # ── Per category at 6h ────────────────────────────────────────────────
    print("\nPer-category significance (6h):")
    categories = sorted(set(s["category"] for s in shocks if s.get("category")))
    significance["by_category_6h"] = {}
    for cat in categories:
        vals = [s["reversion_6h"] for s in shocks if s.get("category") == cat and s.get("reversion_6h") is not None]
        significance["by_category_6h"][cat] = compute_significance(vals, cat)

    # ── Store in MongoDB ──────────────────────────────────────────────────
    db["shock_results"].update_one(
        {"_id": "aggregate_stats"},
        {"$set": {"significance": significance}},
        upsert=True,
    )

    print("\nStored significance data in shock_results.")
    return significance


if __name__ == "__main__":
    run_significance_analysis()
