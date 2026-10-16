"""
Pattern, range and user-defined rule checks.

Three kinds of rule-based problems that the statistical detectors cannot see:

- pattern_violation: in a column that is clearly an e-mail or a phone
  number column (most values match the pattern), a value that does not
  match is flagged.
- range_violation: a value that is impossible for what the column means.
  Built-in sanity rules cover a few obvious cases (an age below 0 or above
  120; a negative price, amount, quantity, count or salary), and the user
  can add rules of their own per dataset (minimum, maximum, allowed values
  or a regular expression for a column).

Everything here only flags. Nothing is changed without reviewer approval,
and a flagged value is never replaced automatically, because the correct
value is unknown.
"""
import re
import uuid
import pandas as pd

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
PHONE_SEPARATORS = re.compile(r"[\s\-().]")
PHONE_RE = re.compile(r"^\+?\d{7,15}$")
PHONE_NAME_HINT = re.compile(r"(phone|mobile|contact_no|tel|cell)", re.I)
PATTERN_SHARE = 0.8        # share of values that must match before a column counts as e-mail / phone
MIN_ROWS_PATTERN = 10

# column-name hint -> (min, max); None means unbounded on that side
BUILTIN_RANGES = [
    (re.compile(r"(^|_)age$", re.I), 0, 120, "an age"),
    # 'amount', 'revenue' and 'cost' are deliberately not here: they can be
    # legitimately negative (refunds, credit notes).
    (re.compile(r"(^|_)(price|salary|quantity|qty|count)$", re.I), 0, None, "a price, quantity or count"),
]


def _phone_ok(v: str) -> bool:
    return bool(PHONE_RE.match(PHONE_SEPARATORS.sub("", v)))


def _issue(itype, col, idx, original, explanation, detected_by, severity="medium", confidence=0.8):
    return {
        "issue_id": str(uuid.uuid4()),
        "issue_type": itype,
        "column": col,
        "row_index": int(idx),
        "row_indices": None,
        "severity": severity,
        "original_value": original if isinstance(original, (str, int, float)) or original is None else str(original),
        "suggested_value": "review manually",
        "explanation": explanation,
        "detected_by": detected_by,
        "confidence": confidence,
    }


def detect_rule_violations(df: pd.DataFrame, user_rules: list[dict] | None = None) -> list[dict]:
    issues = []
    for col in df.columns:
        issues.extend(_check_patterns(df, col))
    issues.extend(_check_builtin_ranges(df))
    issues.extend(_check_user_rules(df, user_rules or []))
    return issues


def _check_patterns(df, col) -> list[dict]:
    if df[col].dtype != object:
        return []
    series = df[col].dropna()
    series = series[series.apply(lambda v: isinstance(v, str))].str.strip()
    if len(series) < MIN_ROWS_PATTERN:
        return []
    out = []
    checks = [("e-mail address", lambda v: bool(EMAIL_RE.match(v)))]
    # Digit strings are too ambiguous (dates, codes, ids), so a column is
    # only treated as a phone column when its NAME says so.
    if PHONE_NAME_HINT.search(str(col)):
        checks.append(("phone number", _phone_ok))
    for name, ok in checks:
        matches = series.apply(ok)
        share = float(matches.mean())
        if share < PATTERN_SHARE or share == 1.0:
            continue
        for idx, val in series[~matches].items():
            out.append(_issue(
                "pattern_violation", col, idx, val,
                f"'{val}' in column '{col}' does not look like a valid {name}, although "
                f"{share:.0%} of the other values in this column do.",
                f"pattern check ({name})", "medium", 0.85))
        break
    return out


def _numeric(df, col):
    return pd.to_numeric(df[col], errors="coerce") if df[col].dtype == object else df[col]


def _check_builtin_ranges(df) -> list[dict]:
    out = []
    for col in df.columns:
        if not (pd.api.types.is_numeric_dtype(df[col]) or df[col].dtype == object):
            continue
        for pattern, lo, hi, meaning in BUILTIN_RANGES:
            if not pattern.search(str(col)):
                continue
            s = _numeric(df, col)
            if s.dropna().empty or not pd.api.types.is_numeric_dtype(s):
                break
            for idx, val in s.dropna().items():
                if (lo is not None and val < lo) or (hi is not None and val > hi):
                    bound = (f"between {lo} and {hi}" if hi is not None else f"at least {lo}")
                    out.append(_issue(
                        "range_violation", col, idx, float(val),
                        f"{val:g} in column '{col}' is outside what is possible for {meaning} "
                        f"(expected {bound}).",
                        "built-in range rule", "high", 0.9))
            break
    return out


def _check_user_rules(df, rules) -> list[dict]:
    out = []
    for rule in rules:
        col = rule.get("column")
        if col not in df.columns:
            continue
        series = df[col].dropna()
        label = rule.get("name") or f"rule on '{col}'"
        if rule.get("min") is not None or rule.get("max") is not None:
            s = pd.to_numeric(series, errors="coerce").dropna()
            for idx, val in s.items():
                if (rule.get("min") is not None and val < rule["min"]) or \
                   (rule.get("max") is not None and val > rule["max"]):
                    out.append(_issue("range_violation", col, idx, float(val),
                        f"{val:g} in column '{col}' breaks the {label}: allowed range is "
                        f"{rule.get('min', '-∞')} to {rule.get('max', '∞')}.",
                        "user-defined rule", "high", 0.95))
        if rule.get("allowed"):
            allowed = {str(a) for a in rule["allowed"]}
            for idx, val in series.items():
                if str(val) not in allowed:
                    out.append(_issue("range_violation", col, idx, val,
                        f"'{val}' in column '{col}' is not one of the allowed values for the {label}.",
                        "user-defined rule", "high", 0.95))
        if rule.get("regex"):
            rx = re.compile(rule["regex"])
            for idx, val in series.items():
                if not rx.fullmatch(str(val)):
                    out.append(_issue("pattern_violation", col, idx, val,
                        f"'{val}' in column '{col}' does not match the pattern of the {label}.",
                        "user-defined rule", "high", 0.95))
    return out
