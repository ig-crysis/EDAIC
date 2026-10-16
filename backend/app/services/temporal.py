"""
Window-based anomaly detection for time-ordered data.

A value that is normal for the table as a whole can still be a spike in
its own neighbourhood: 900 sales on a day when the surrounding days have
100. When a table has a date column that is in time order, every numeric
column is compared with the median of the rows around it (a rolling
window), and a value that deviates by more than `THRESHOLD` robust
standard deviations (median absolute deviation of the residuals) is
flagged as a temporal anomaly.
"""
import uuid
import numpy as np
import pandas as pd

from app.services.categorical_dates import _parse_date
from app.services.duplicates import _detect_id_columns

WINDOW = 7
THRESHOLD = 6.0
MIN_ROWS = 30


def _find_time_column(df):
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            ts = df[col]
        elif df[col].dtype == object:
            vals = df[col].dropna()
            if vals.empty:
                continue
            parsed = [_parse_date(v) for v in vals.tolist()]
            if sum(p is not None for p in parsed) / len(parsed) < 0.9:
                continue
            ts = pd.Series([p for p in parsed], index=vals.index)
        else:
            continue
        ts = ts.dropna()
        if len(ts) >= MIN_ROWS and ts.is_monotonic_increasing and ts.nunique() > 1:
            return col
    return None


def detect_temporal_anomalies(df: pd.DataFrame) -> list[dict]:
    if len(df) < MIN_ROWS:
        return []
    time_col = _find_time_column(df)
    if time_col is None:
        return []
    id_cols = set(_detect_id_columns(df))
    issues = []
    for col in df.select_dtypes(include=[np.number]).columns:
        if col in id_cols or col == time_col:
            continue
        s = df[col].astype(float)
        if s.notna().sum() < MIN_ROWS:
            continue
        # median of the neighbours on both sides, excluding the point itself
        neigh = pd.concat([s.shift(k) for k in range(-WINDOW // 2, WINDOW // 2 + 1) if k != 0], axis=1)
        med = neigh.median(axis=1)
        resid = (s - med).dropna()
        centre = float(resid.median())
        mad = float((resid - centre).abs().median())
        scale = 1.4826 * mad
        if scale <= 1e-9:
            continue
        z_scores = ((resid - centre).abs() / scale)
        for idx, z in z_scores[z_scores > THRESHOLD].items():
            issues.append({
                "issue_id": str(uuid.uuid4()),
                "issue_type": "temporal_anomaly",
                "column": col,
                "row_index": int(idx),
                "row_indices": None,
                "severity": "medium",
                "original_value": float(s[idx]),
                "suggested_value": "review manually",
                "explanation": (
                    f"The value {s[idx]:g} in column '{col}' is far from its neighbours in time "
                    f"(the surrounding rows are around {med[idx]:g}, a deviation of {z:.1f} robust "
                    f"standard deviations). It may be a spike or a recording error."
                ),
                "detected_by": "rolling-window median check",
                "confidence": round(min(1.0, float(z) / (2 * THRESHOLD)), 2),
            })
    return issues
