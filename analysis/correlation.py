"""
Cross-market shock correlation analysis for ShockTest.

Computes a co-occurrence matrix: for each pair of categories, how often
does a shock in category A occur within 24h of a shock in category B?

Also computes whether co-occurring shocks revert more or less strongly
than isolated shocks — useful for portfolio construction.

Stores result in shock_results["aggregate_stats"] for the dashboard.

Usage:
    python analysis/correlation.py
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np

from analysis.helpers import get_db

WINDOW_HOURS = 24


def run_correlation_analysis() -> dict:
    db = get_db()

    shocks = list(db["shock_events"].find({"category": {"$ne": None}}))
    print(f"Loaded {len(shocks)} categorized shocks")

    categories = sorted(set(s["category"] for s in shocks))
    print(f"Categories: {categories}")

    # Parse timestamps once
    def parse_t(s: dict) -> datetime:
        raw = s["t2"]
        if isinstance(raw, datetime):
            return raw.replace(tzinfo=timezone.utc) if raw.tzinfo is None else raw
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))

    times = [parse_t(s) for s in shocks]

    # ── Co-occurrence matrix ───────────────────────────────────────────────
    # matrix[c1][c2] = number of (c1, c2) shock pairs within WINDOW_HOURS
    matrix: dict[str, dict[str, int]] = {c: {c2: 0 for c2 in categories} for c in categories}

    # For each shock, also track reversion when co-occurring vs isolated
    co_rev: dict[str, list[float]] = {c: [] for c in categories}
    iso_rev: dict[str, list[float]] = {c: [] for c in categories}

    window_sec = WINDOW_HOURS * 3600

    for i, s1 in enumerate(shocks):
        t1 = times[i]
        cat1 = s1["category"]
        has_cooccurrence = False

        for j, s2 in enumerate(shocks):
            if i == j:
                continue
            t2 = times[j]
            if abs((t2 - t1).total_seconds()) <= window_sec:
                cat2 = s2["category"]
                if j > i:  # count each pair once
                    matrix[cat1][cat2] += 1
                    matrix[cat2][cat1] += 1
                if cat1 != cat2:
                    has_cooccurrence = True

        rev = s1.get("reversion_6h")
        if rev is not None:
            if has_cooccurrence:
                co_rev[cat1].append(rev)
            else:
                iso_rev[cat1].append(rev)

    # ── Normalise to rates (co-occurrences per shock in category) ──────────
    cat_counts = {c: sum(1 for s in shocks if s["category"] == c) for c in categories}
    rate_matrix: dict[str, dict[str, float]] = {}
    for c1 in categories:
        rate_matrix[c1] = {}
        for c2 in categories:
            n = cat_counts[c1]
            rate_matrix[c1][c2] = round(matrix[c1][c2] / n, 3) if n else 0.0

    # ── Reversion: co-occurring vs isolated ───────────────────────────────
    co_vs_iso: dict[str, dict] = {}
    for cat in categories:
        co = co_rev[cat]
        iso = iso_rev[cat]
        co_vs_iso[cat] = {
            "co_occurring_win_rate": round(float(np.mean(np.array(co) > 0)), 3) if co else None,
            "co_occurring_mean_rev": round(float(np.mean(co)), 4) if co else None,
            "co_occurring_n": len(co),
            "isolated_win_rate": round(float(np.mean(np.array(iso) > 0)), 3) if iso else None,
            "isolated_mean_rev": round(float(np.mean(iso)), 4) if iso else None,
            "isolated_n": len(iso),
        }

    # ── Store in MongoDB ───────────────────────────────────────────────────
    result = {
        "correlation_matrix": {
            "categories": categories,
            "counts": [[matrix[c1][c2] for c2 in categories] for c1 in categories],
            "rates": [[rate_matrix[c1][c2] for c2 in categories] for c1 in categories],
            "category_counts": cat_counts,
            "window_hours": WINDOW_HOURS,
        },
        "co_occurrence_reversion": co_vs_iso,
    }

    db["shock_results"].update_one(
        {"_id": "aggregate_stats"},
        {"$set": result},
        upsert=True,
    )

    # ── Print results ──────────────────────────────────────────────────────
    print(f"\nCo-occurrence matrix (shock pairs within {WINDOW_HOURS}h):")
    col_w = 12
    print(f"{'':15s}", end="")
    for cat in categories:
        print(f"{cat[:col_w]:>{col_w}}", end="")
    print()
    for c1 in categories:
        print(f"{c1:15s}", end="")
        for c2 in categories:
            print(f"{matrix[c1][c2]:>{col_w}}", end="")
        print(f"  (n={cat_counts[c1]})")

    print("\nRate matrix (co-occurrences per shock in row category):")
    print(f"{'':15s}", end="")
    for cat in categories:
        print(f"{cat[:col_w]:>{col_w}}", end="")
    print()
    for c1 in categories:
        print(f"{c1:15s}", end="")
        for c2 in categories:
            print(f"{rate_matrix[c1][c2]:>{col_w}.2f}", end="")
        print()

    print("\nCo-occurring vs isolated reversion (6h win rate):")
    for cat, d in co_vs_iso.items():
        co_str = (
            f"{d['co_occurring_win_rate']:.1%} (n={d['co_occurring_n']})"
            if d["co_occurring_win_rate"] is not None
            else "N/A"
        )
        iso_str = f"{d['isolated_win_rate']:.1%} (n={d['isolated_n']})" if d["isolated_win_rate"] is not None else "N/A"
        print(f"  {cat:12s}  co-occurring: {co_str:<20}  isolated: {iso_str}")

    print("\nStored correlation data in shock_results.")
    return result


if __name__ == "__main__":
    run_correlation_analysis()
