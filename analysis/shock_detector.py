"""
Shock detection algorithm for ShockTest.

A shock occurs when |p(t2) - p(t1)| >= theta within window_minutes.

Usage:
    from analysis.shock_detector import find_shocks, run_detection
    shocks = find_shocks("market-id-123", theta=0.08, window_minutes=60)
    run_detection()  # runs on all markets and writes to shock_events collection
"""

import pandas as pd

from analysis.helpers import get_db, load_market_series


def resample_to_regular(df: pd.DataFrame, interval_min: int = 1) -> pd.DataFrame:
    """
    Resample an irregular time series to fixed intervals via interpolation.

    Args:
        df:           DataFrame with columns t (datetime, UTC), p (float 0-1).
        interval_min: Target bar size in minutes. Default 1 (matches helpers.get_delta).

    Returns:
        Resampled DataFrame with same columns, gaps filled by time interpolation.
        Returns empty DataFrame if input is empty.
    """
    if df.empty:
        return df

    df = df.set_index("t")
    df = df.resample(f"{interval_min}min").last()
    df["p"] = df["p"].interpolate(method="time", limit=10)
    df = df.dropna()
    df = df.reset_index()
    return df


def find_shocks(
    market_id: str,
    theta: float = 0.08,
    window_minutes: int = 60,
    interval_min: int = 1,
) -> list[dict]:
    """
    Detect probability shocks in a single market's time series.

    A shock is defined as |p(t2) - p(t1)| >= theta within window_minutes.
    Overlapping shocks within the same window are deduplicated — only the
    largest (by abs_delta) is kept.

    Args:
        market_id:      market_id field value in the market_series collection.
        theta:          Minimum absolute probability change to qualify (default 0.08 = 8pp).
        window_minutes: Lookback window in minutes (default 60).
        interval_min:   Resample resolution in minutes (default 1).

    Returns:
        List of shock dicts with keys:
            market_id, t1 (ISO str), t2 (ISO str),
            p_before, p_after, delta, abs_delta
        Empty list if market has no data or no shocks.
    """
    df = load_market_series(market_id)
    if df.empty or len(df) < 10:
        return []

    df = resample_to_regular(df, interval_min)
    if df.empty:
        return []

    # Reset index after resample so iloc works cleanly
    df = df.reset_index(drop=True)

    periods = window_minutes // interval_min  # number of bars in the window
    shocks = []

    for i in range(periods, len(df)):
        p_now = float(df.loc[i, "p"])
        p_then = float(df.loc[i - periods, "p"])
        delta = p_now - p_then

        if abs(delta) >= theta:
            shocks.append(
                {
                    "market_id": market_id,
                    "t1": df.loc[i - periods, "t"].isoformat(),
                    "t2": df.loc[i, "t"].isoformat(),
                    "p_before": round(p_then, 4),
                    "p_after": round(p_now, 4),
                    "delta": round(delta, 4),
                    "abs_delta": round(abs(delta), 4),
                }
            )

    if not shocks:
        return []

    # Deduplicate: within each window span, keep only the largest shock
    deduped = [shocks[0]]
    for s in shocks[1:]:
        prev = deduped[-1]
        t2_prev = pd.Timestamp(prev["t2"])
        t2_curr = pd.Timestamp(s["t2"])
        if (t2_curr - t2_prev).total_seconds() < window_minutes * 60:
            if s["abs_delta"] > prev["abs_delta"]:
                deduped[-1] = s
        else:
            deduped.append(s)

    return deduped


def run_detection(theta: float = 0.08, window_minutes: int = 60) -> int:
    """
    Run shock detection across all markets in MongoDB and write results to shock_events.

    Enriches each shock with question, source, and category from market_series.
    Drops and recreates shock_events on each run (idempotent).

    Args:
        theta:          Shock threshold (default 0.08).
        window_minutes: Detection window in minutes (default 60).

    Returns:
        Number of shocks written to shock_events.
    """
    db = get_db()
    market_ids = db["market_series"].distinct("market_id")
    print(f"Running shock detection on {len(market_ids)} markets (theta={theta}, window={window_minutes}min)...")

    all_shocks: list[dict] = []

    for market_id in market_ids:
        shocks = find_shocks(market_id, theta=theta, window_minutes=window_minutes)
        if shocks:
            print(f"  {market_id}: {len(shocks)} shock(s)")
            all_shocks.extend(shocks)

    # If too few shocks at default threshold, warn but don't auto-lower
    if len(all_shocks) < 15:
        print(f"\nWARNING: only {len(all_shocks)} shocks at theta={theta}.")
        print("Consider lowering theta to 0.05 — re-run: run_detection(theta=0.05)")

    if not all_shocks:
        print("No shocks found — shock_events not modified.")
        return 0

    # Enrich with metadata from market_series
    market_meta: dict[str, dict] = {}
    for doc in db["market_series"].find({}, {"market_id": 1, "question": 1, "source": 1, "category": 1}):
        market_meta[doc["market_id"]] = {
            "question": doc.get("question", ""),
            "source": doc.get("source", ""),
            "category": doc.get("category"),
        }

    for shock in all_shocks:
        meta = market_meta.get(shock["market_id"], {})
        shock["question"] = meta.get("question", "")
        shock["source"] = meta.get("source", "")
        shock["category"] = meta.get("category")
        # Post-shock outcome fields — filled later by post_shock.py
        shock["post_move_1h"] = None
        shock["post_move_6h"] = None
        shock["post_move_24h"] = None
        shock["reversion_1h"] = None
        shock["reversion_6h"] = None
        shock["reversion_24h"] = None

    # Idempotent: drop and rewrite
    db["shock_events"].drop()
    db["shock_events"].insert_many(all_shocks)
    print(f"\nStored {len(all_shocks)} shocks in shock_events collection.")
    return len(all_shocks)


if __name__ == "__main__":
    run_detection()
