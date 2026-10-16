"""
Rule-based detection of inconsistent values: mixed casing/spacing on
categorical text, inconsistent date formats, and mixed units or
numeric-as-string values.
"""
import re
import uuid
from datetime import datetime
import pandas as pd

DATE_PATTERNS = [
    ("%Y-%m-%d", r"^\d{4}-\d{2}-\d{2}$"),
    # NOTE: "DD/MM/YYYY" and "MM/DD/YYYY" are indistinguishable by regex
    # alone (both are just two digits / two digits / four digits), so they
    # are intentionally represented as ONE pattern here. Treating them as
    # two separate entries previously caused the same date to be matched
    # and flagged twice. We label this bucket "%d/%m/%Y" for display, and
    # disambiguate the actual day/month order (where possible) when
    # producing a suggested replacement value, using the day-of-month.
    ("%d/%m/%Y", r"^\d{2}/\d{2}/\d{4}$"),
    ("%d-%m-%Y", r"^\d{2}-\d{2}-\d{4}$"),
    ("%B %d, %Y", r"^[A-Za-z]+ \d{1,2}, \d{4}$"),
]


def _parse_slash_date(val: str):
    """Best-effort parse of an ambiguous DD/MM/YYYY vs MM/DD/YYYY value.
    If the first number is > 12, it must be a day, so we know the order.
    Otherwise we fall back to day/month order (the more common convention
    outside the US) and flag it as a best-effort guess."""
    parts = val.split("/")
    a, b, year = int(parts[0]), int(parts[1]), parts[2]
    if a > 12:
        day, month = a, b
    elif b > 12:
        month, day = a, b
    else:
        day, month = a, b  # ambiguous — default to day/month
    return datetime(int(year), month, day)


def detect_inconsistencies(df: pd.DataFrame) -> list[dict]:
    issues = []
    for col in df.columns:
        series = df[col].dropna()
        if series.empty or df[col].dtype != object:
            continue

        issues.extend(_check_casing_and_spacing(df, col, series))
        issues.extend(_check_date_format(df, col, series))
        issues.extend(_check_numeric_as_string(df, col, series))

    return issues


def _check_casing_and_spacing(df, col, series) -> list[dict]:
    issues = []
    normalized_groups: dict[str, set[str]] = {}
    for idx, val in series.items():
        if not isinstance(val, str):
            continue
        norm = val.strip().lower()
        normalized_groups.setdefault(norm, set()).add(val)

    for norm, variants in normalized_groups.items():
        if len(variants) > 1:
            canonical = _choose_canonical(series, variants)
            for idx, val in series.items():
                if isinstance(val, str) and val in variants and val != canonical:
                    issues.append({
                        "issue_id": str(uuid.uuid4()),
                        "issue_type": "inconsistent_value",
                        "column": col,
                        "row_index": int(idx),
                        "row_indices": None,
                        "severity": "low",
                        "original_value": val,
                        "suggested_value": canonical,
                        "explanation": (
                            f"'{val}' in column '{col}' appears to be a formatting variant "
                            f"of '{canonical}' (differs only by case/whitespace). Standardizing "
                            f"to the most frequent form improves consistency for grouping/analysis."
                        ),
                        "detected_by": "rule-based normalization (case/whitespace folding)",
                        "confidence": 0.9,
                    })
    return issues


def _choose_canonical(series, variants) -> str:
    """Most frequent variant wins. On a tie, prefer a properly capitalised
    form (Title Case) over all-lower or all-upper, then the variant that
    appears first, so the choice is deterministic and not an accident of
    set ordering."""
    counts = {v: int((series == v).sum()) for v in variants}
    first_pos = {}
    for pos, val in enumerate(series.tolist()):
        if val in counts and val not in first_pos:
            first_pos[val] = pos
    return max(variants, key=lambda v: (counts[v], v.strip().istitle(), -first_pos.get(v, 0)))


def _check_date_format(df, col, series) -> list[dict]:
    str_vals = series[series.apply(lambda v: isinstance(v, str))]
    if str_vals.empty:
        return []

    format_hits = {}
    for fmt, pattern in DATE_PATTERNS:
        matches = str_vals[str_vals.str.match(pattern)]
        if len(matches) > 0:
            format_hits[fmt] = len(matches)

    if len(format_hits) < 2:
        return []  # single consistent format (or no dates) — nothing to flag

    dominant_fmt = max(format_hits, key=format_hits.get)
    issues = []
    for fmt, pattern in DATE_PATTERNS:
        if fmt == dominant_fmt:
            continue
        matches = str_vals[str_vals.str.match(pattern)]
        for idx, val in matches.items():
            try:
                if fmt == "%d/%m/%Y":
                    parsed = _parse_slash_date(val)
                else:
                    parsed = datetime.strptime(val, fmt)
                suggested = parsed.strftime(dominant_fmt)
            except ValueError:
                suggested = None
            issues.append({
                "issue_id": str(uuid.uuid4()),
                "issue_type": "inconsistent_value",
                "column": col,
                "row_index": int(idx),
                "row_indices": None,
                "severity": "medium",
                "original_value": val,
                "suggested_value": suggested,
                "explanation": (
                    f"'{val}' in column '{col}' uses date format '{fmt}', but the "
                    f"majority of values in this column use '{dominant_fmt}'. "
                    f"Reformatting to match keeps dates sortable and machine-readable."
                ),
                "detected_by": "rule-based date pattern matching",
                "confidence": 0.85,
            })
    return issues


def _check_numeric_as_string(df, col, series) -> list[dict]:
    """Flags numeric-looking strings mixed into an otherwise numeric column
    that carry a genuine formatting problem — e.g. stray units ('45kg'),
    currency symbols ('$45'), or malformed comma grouping ('12,34,567').

    Standard thousands-separator commas (e.g. '1,234,567') are NOT flagged
    on their own, even when other rows in the same column are small plain
    numbers with no commas (e.g. '523'). A column mixing small and large
    numbers is completely normal — larger numbers conventionally get comma
    separators, smaller ones don't need them. That size difference is not
    a data-quality issue, so it must not be "corrected" away.
    """
    issues = []
    # Valid US/UK-style thousands grouping: 1-3 digits, then groups of
    # exactly 3 digits separated by commas, optional decimal part.
    valid_comma_grouping = re.compile(r"^\s*-?\d{1,3}(,\d{3})+(\.\d+)?\s*$")
    plain_numeric = re.compile(r"^\s*-?\d+\.?\d*\s*$")
    numeric_like = re.compile(r"^\s*[\d,]+\.?\d*\s*[a-zA-Z%$]*\s*$")

    plain_numeric_count = sum(bool(plain_numeric.match(str(v))) for v in series)
    valid_comma_count = sum(bool(valid_comma_grouping.match(str(v))) for v in series)
    numeric_like_count = plain_numeric_count + valid_comma_count

    if numeric_like_count == 0 or numeric_like_count == len(series):
        return []  # either not a numeric-ish column, or already fully clean

    for idx, val in series.items():
        s = str(val)
        if plain_numeric.match(s) or valid_comma_grouping.match(s):
            continue  # both are valid, non-inconsistent numeric formats
        if numeric_like.match(s):
            cleaned = re.sub(r"[^\d.\-]", "", s)
            issues.append({
                "issue_id": str(uuid.uuid4()),
                "issue_type": "inconsistent_value",
                "column": col,
                "row_index": int(idx),
                "row_indices": None,
                "severity": "medium",
                "original_value": val,
                "suggested_value": cleaned,
                "explanation": (
                    f"'{val}' in column '{col}' mixes non-standard formatting "
                    f"(a unit, symbol, or malformed number grouping) with a number. "
                    f"Stripping the non-numeric characters gives '{cleaned}'."
                ),
                "detected_by": "rule-based numeric-format matching",
                "confidence": 0.8,
            })
    return issues
