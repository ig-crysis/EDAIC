"""
Missing-value detection and imputation-suggestion logic.
"""
import uuid
import pandas as pd
import numpy as np


# A column that is missing in more than this share of its rows carries too
# little information to be filled in honestly: imputing it would invent
# the data for almost every row and make the table look more complete
# than it is. Such a column gets ONE column-level issue (keep as is or
# drop) instead of one fill suggestion per cell.
SPARSE_COLUMN_THRESHOLD = 0.9


def detect_missing_values(df: pd.DataFrame) -> list[dict]:
    """
    Scans every column for nulls and produces one Issue dict per affected
    row/column cell, with a suggested imputation value and a plain-English
    explanation of why that value was chosen.
    """
    issues = []
    n_rows = len(df)

    for col in df.columns:
        missing_mask = df[col].isna()
        n_missing = int(missing_mask.sum())
        if n_missing == 0:
            continue

        missing_pct = n_missing / n_rows if n_rows else 0
        if missing_pct > SPARSE_COLUMN_THRESHOLD and n_rows >= 2:
            issues.append({
                "issue_id": str(uuid.uuid4()),
                "issue_type": "sparse_column",
                "column": col,
                "row_index": None,
                "row_indices": None,
                "severity": "high",
                "original_value": None,
                "suggested_value": "drop this column, or keep it unfilled",
                "explanation": (
                    f"'{col}' is empty in {n_missing} of {n_rows} rows ({missing_pct:.1%}). "
                    f"Filling it would invent a value for almost every row and make the data "
                    f"look more complete than it is, so no per-cell fill is proposed. "
                    f"Suggestion: drop the column, or keep it as it is."
                ),
                "detected_by": "null-share check (sparse column)",
                "confidence": 0.9,
            })
            continue

        suggestion, reason, method = _suggest_fill_value(df, col)

        severity = "high" if missing_pct > 0.3 else ("medium" if missing_pct > 0.05 else "low")

        for row_idx in df.index[missing_mask]:
            issues.append({
                "issue_id": str(uuid.uuid4()),
                "issue_type": "missing_value",
                "column": col,
                "row_index": int(row_idx),
                "row_indices": None,
                "severity": severity,
                "original_value": None,
                "suggested_value": suggestion,
                "explanation": (
                    f"'{col}' is missing in this row. Suggested fill: {suggestion!r} "
                    f"({reason}). Column-wide, {n_missing} of {n_rows} rows "
                    f"({missing_pct:.1%}) are missing this value."
                ),
                "detected_by": f"null-check + {method}",
                "confidence": 0.95 if method != "mode" else 0.8,
            })

    return issues


def _suggest_fill_value(df: pd.DataFrame, col: str):
    """
    Chooses an imputation strategy based on column dtype and distribution,
    returning (value, human_reason, method_name).
    """
    series = df[col].dropna()

    if series.empty:
        return None, "the entire column is empty, no statistic could be computed", "none"

    if pd.api.types.is_numeric_dtype(series):
        skew = float(series.skew()) if len(series) > 2 else 0.0
        if abs(skew) > 1:
            value = float(series.median())
            reason = f"median used because the column is skewed (skewness={skew:.2f}), making it robust to outliers"
            method = "median"
        else:
            value = float(series.mean())
            reason = "mean used because the column is roughly symmetric"
            method = "mean"
        return round(value, 4), reason, method

    if pd.api.types.is_datetime64_any_dtype(series):
        value = series.mode().iloc[0]
        return str(value), "most frequent date used as a neutral default", "mode"

    # Categorical / text
    mode_val = series.mode()
    if not mode_val.empty:
        value = mode_val.iloc[0]
        freq_pct = (series == value).mean()
        return value, f"most frequent category, appearing in {freq_pct:.1%} of non-missing rows", "mode"

    return "Unknown", "no dominant category found; using a placeholder label", "placeholder"
