"""
Preprocessing helpers that run before detection.

Real-world CSVs frequently store numeric columns as text because a few
large values use thousands-separator commas (e.g. a COVID dataset with
'Total Deaths' containing both '523' and '12,345'). pandas then reads
the WHOLE column as text/object, not numbers — which silently breaks
two things if left uncorrected:
  1. Missing-value imputation picks a categorical strategy (mode) for a
     column that is actually numeric, producing a poor fill suggestion.
  2. Outlier detection only looks at columns pandas already recognizes
     as numeric, so the whole column gets skipped entirely — no outliers
     can ever be found in it, correct or not.

`numeric_coerced_view()` produces a copy of the dataframe where such
columns are converted to real floats (commas stripped) — used ONLY for
statistical detectors (missing values, outliers). Duplicate and
inconsistency detection intentionally keep working on the original,
literal string values, since they need to see the actual formatting to
do their job.
"""
import re
import pandas as pd

_PLAIN_NUMERIC = re.compile(r"^\s*-?\d+\.?\d*\s*$")
_VALID_COMMA_GROUPING = re.compile(r"^\s*-?\d{1,3}(,\d{3})+(\.\d+)?\s*$")


def _is_numeric_like(value) -> bool:
    if pd.isna(value):
        return True  # missing values don't disqualify a column from being numeric
    s = str(value)
    return bool(_PLAIN_NUMERIC.match(s) or _VALID_COMMA_GROUPING.match(s))


def _to_float(value):
    if pd.isna(value):
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        # Stray non-numeric token (e.g. "?", "n/a") inside an otherwise
        # numeric column: treat as missing instead of crashing the scan.
        return None


def numeric_coerced_view(df: pd.DataFrame, min_numeric_fraction: float = 0.9) -> pd.DataFrame:
    """
    Returns a COPY of df where any object-dtype column whose non-null
    values are at least `min_numeric_fraction` plain-or-comma-formatted
    numbers gets converted to a real float column. Columns that are
    already numeric, or don't meet the threshold, are left untouched.
    """
    coerced = df.copy()

    for col in df.columns:
        series = df[col]
        if pd.api.types.is_numeric_dtype(series):
            continue  # already numeric, nothing to do

        non_null = series.dropna()
        if non_null.empty:
            continue

        numeric_like_count = sum(_is_numeric_like(v) for v in non_null)
        if numeric_like_count / len(non_null) >= min_numeric_fraction:
            coerced[col] = series.apply(_to_float)

    return coerced
