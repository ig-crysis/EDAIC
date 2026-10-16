"""
Anomaly checks for the column types that Local Outlier Factor cannot
score: categorical text columns (rare values) and date columns
(implausible dates).

- rare_category: in a low-cardinality text column, a value that occurs
  very rarely is usually a typo or a data-entry error. When a frequent
  category is a close match, it is offered as the suggested fix.
- date_anomaly: in a date column, a date that is far outside the range of
  the other dates (beyond three interquartile ranges of the middle half),
  before 1900, or in the future is flagged for review.

Both checks are conservative and only ever suggest; nothing is changed
without reviewer approval.
"""
import re
import uuid
from datetime import datetime
from difflib import get_close_matches

import pandas as pd

from app.services.inconsistencies import DATE_PATTERNS, _parse_slash_date

MIN_ROWS_CATEGORICAL = 30
MAX_CATEGORIES = 30
MAX_CATEGORY_SHARE = 0.2     # unique values / non-null rows
RARE_SHARE = 0.01            # a value is rare if it is under 1% of rows ...
RARE_MAX_COUNT = 3           # ... and appears at most this many times
MIN_ROWS_DATES = 10
DATE_FENCE_IQR = 3.0

_NUMERIC_LIKE = re.compile(r"^\s*-?[\d,]+\.?\d*\s*$")


def _parse_date(val):
    if not isinstance(val, str):
        return None
    v = val.strip()
    for fmt, pattern in DATE_PATTERNS:
        if re.match(pattern, v):
            try:
                return _parse_slash_date(v) if fmt == "%d/%m/%Y" else datetime.strptime(v, fmt)
            except ValueError:
                return None
    return None


def detect_categorical_and_date_anomalies(df: pd.DataFrame) -> list[dict]:
    issues = []
    for col in df.columns:
        series = df[col].dropna()
        if series.empty:
            continue
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            issues.extend(_check_dates(col, series.dt.to_pydatetime().tolist(), series.index.tolist()))
            continue
        if df[col].dtype != object:
            continue
        parsed = [_parse_date(v) for v in series.tolist()]
        if sum(p is not None for p in parsed) / len(parsed) >= 0.8:
            pairs = [(p, i) for p, i in zip(parsed, series.index.tolist()) if p is not None]
            issues.extend(_check_dates(col, [p for p, _ in pairs], [i for _, i in pairs]))
            continue
        issues.extend(_check_rare_categories(col, series))
    return issues


def _check_rare_categories(col, series) -> list[dict]:
    str_series = series[series.apply(lambda v: isinstance(v, str))]
    n = len(str_series)
    if n < MIN_ROWS_CATEGORICAL:
        return []
    numeric_share = str_series.apply(lambda v: bool(_NUMERIC_LIKE.match(v))).mean()
    if numeric_share >= 0.5:
        return []
    norm = str_series.str.strip().str.lower()
    counts = norm.value_counts()
    if len(counts) > MAX_CATEGORIES or len(counts) / n > MAX_CATEGORY_SHARE or len(counts) < 2:
        return []

    frequent = [c for c, k in counts.items() if k / n > RARE_SHARE and k > RARE_MAX_COUNT]
    issues = []
    for idx, val in str_series.items():
        key = val.strip().lower()
        k = int(counts[key])
        if k / n > RARE_SHARE:
            continue
        close = get_close_matches(key, frequent, n=1, cutoff=0.8)
        # A spelling that is close to a common value is a likely typo, so it is
        # flagged however many times it occurs (up to the share limit). A value
        # with no close relative is only flagged when it is truly isolated.
        if not close and k > RARE_MAX_COUNT:
            continue
        if close:
            # report the most common original spelling of that category
            spelling = str_series[norm == close[0]].value_counts().index[0]
            suggested = spelling
            how = f"it is very close to the common value '{spelling}', so it is probably a typo"
        else:
            suggested = "review manually"
            how = "no common value is close to it, so it needs a manual look"
        issues.append({
            "issue_id": str(uuid.uuid4()),
            "issue_type": "rare_category",
            "column": col,
            "row_index": int(idx),
            "row_indices": None,
            "severity": "low",
            "original_value": val,
            "suggested_value": suggested,
            "explanation": (
                f"'{val}' appears only {k} time(s) among {n} rows in column '{col}', which "
                f"otherwise has {len(frequent)} common values; {how}."
            ),
            "detected_by": "rare-category frequency check",
            "confidence": 0.7 if close else 0.5,
        })
    return issues


def _check_dates(col, dates, index) -> list[dict]:
    if len(dates) < MIN_ROWS_DATES:
        return []
    ts = pd.Series([d.timestamp() for d in dates])
    q1, q3 = ts.quantile(0.25), ts.quantile(0.75)
    iqr = q3 - q1
    lo, hi = q1 - DATE_FENCE_IQR * iqr, q3 + DATE_FENCE_IQR * iqr
    typical_lo = datetime.fromtimestamp(float(ts.quantile(0.05))).strftime("%Y-%m-%d")
    typical_hi = datetime.fromtimestamp(float(ts.quantile(0.95))).strftime("%Y-%m-%d")
    now = datetime.now()
    issues = []
    for d, idx, t in zip(dates, index, ts.tolist()):
        reasons = []
        if d.year < 1900:
            reasons.append("it is before the year 1900")
        if d > now:
            reasons.append("it lies in the future")
        if iqr > 0 and (t < lo or t > hi):
            reasons.append(f"it is far outside the range of the other dates (mostly {typical_lo} to {typical_hi})")
        if not reasons:
            continue
        issues.append({
            "issue_id": str(uuid.uuid4()),
            "issue_type": "date_anomaly",
            "column": col,
            "row_index": int(idx),
            "row_indices": None,
            "severity": "medium",
            "original_value": d.strftime("%Y-%m-%d"),
            "suggested_value": "review manually",
            "explanation": f"The date {d.strftime('%Y-%m-%d')} in column '{col}' looks unusual: " + "; ".join(reasons) + ".",
            "detected_by": "date range check (IQR fence)",
            "confidence": 0.75,
        })
    return issues
