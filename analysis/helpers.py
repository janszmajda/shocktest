"""
Shared utility functions for ShockTest analysis.

Used by: shock_detector.py, post_shock.py, categorize.py, aggregate.py
"""

import os

import pandas as pd
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.database import Database

load_dotenv()


def get_db() -> Database:
    """Return MongoDB database handle."""
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise EnvironmentError("MONGODB_URI not set — copy .env.example to .env and fill in the value")
    client = MongoClient(uri)
    return client["shocktest"]


def load_market_series(market_id: str) -> pd.DataFrame:
    """
    Load a market's price time series from MongoDB.

    Args:
        market_id: The market_id field value stored in market_series collection.

    Returns:
        DataFrame with columns:
            t (datetime64[ns], UTC): timestamp of each price point
            p (float64):             probability 0-1
        Sorted ascending by t, index reset.

    Raises:
        ValueError: if market_id is not found in MongoDB.
    """
    db = get_db()
    doc = db["market_series"].find_one({"market_id": market_id})
    if doc is None:
        raise ValueError(f"Market '{market_id}' not found in market_series collection")

    df = pd.DataFrame(doc["series"])  # [{t: float, p: float}, ...]
    df["t"] = pd.to_datetime(df["t"], unit="s", utc=True)
    df["p"] = df["p"].astype(float)
    df = df.sort_values("t").reset_index(drop=True)
    return df


def get_delta(series: pd.DataFrame, window_minutes: int = 60) -> pd.Series:
    """
    Compute rolling price change over a lookback window.

    Resamples the series to 1-minute resolution before computing deltas so that
    results are consistent regardless of the original sampling frequency.
    (Real data from clob.polymarket.com averages ~10 min between points but is
    irregular — resampling normalises this before the rolling shift.)

    Args:
        series:         DataFrame with columns t (datetime), p (float 0-1).
        window_minutes: Lookback window in minutes. Default 60 (1 hour).

    Returns:
        pd.Series of delta values (p_now - p_window_ago), indexed by timestamp.
        NaN for the first `window_minutes` rows where history is unavailable.
    """
    df = series.set_index("t").resample("1min").last()
    df["p"] = df["p"].interpolate(method="time")

    periods = window_minutes  # 1-min bars, so periods == minutes
    delta = df["p"] - df["p"].shift(periods)
    return delta


def interpolate_price_at(series: pd.DataFrame, target_time: pd.Timestamp) -> float | None:
    """
    Return the linearly interpolated probability at a given timestamp.

    Args:
        series:      DataFrame with columns t (datetime), p (float 0-1).
        target_time: The timestamp to look up.

    Returns:
        Interpolated probability, or None if target_time is outside the series range.
    """
    df = series.sort_values("t").reset_index(drop=True)

    if target_time < df["t"].iloc[0] or target_time > df["t"].iloc[-1]:
        return None

    # Find the two surrounding points
    idx_after = df["t"].searchsorted(target_time)

    if idx_after == 0:
        return float(df["p"].iloc[0])
    if idx_after >= len(df):
        return float(df["p"].iloc[-1])

    t0, p0 = df["t"].iloc[idx_after - 1], df["p"].iloc[idx_after - 1]
    t1, p1 = df["t"].iloc[idx_after], df["p"].iloc[idx_after]

    span = (t1 - t0).total_seconds()
    if span == 0:
        return float(p0)

    frac = (target_time - t0).total_seconds() / span
    return float(p0 + frac * (p1 - p0))
