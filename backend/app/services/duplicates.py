"""
Duplicate-row detection: exact duplicates and near-duplicates
(fuzzy match on string columns using normalized similarity).
"""
import re
import uuid
import pandas as pd
from difflib import SequenceMatcher

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_CODE_PATTERN = re.compile(r"^[A-Za-z]{0,6}[-_ ]?\d{2,}$")  # e.g. 'u123', 'ORD-0042'

_ID_NAME_PATTERN = re.compile(r"(^id$|_id$|^#$|^no$|^number$|^index$)", re.IGNORECASE)


def _detect_id_columns(df: pd.DataFrame) -> list[str]:
    """
    Identifies columns that are very likely auto-generated row identifiers
    (e.g. a primary key like 'customer_id') rather than real-world data.

    This matters because a genuine duplicate record — the same person's
    data submitted twice — will almost always get a NEW auto-incrementing
    ID the second time, since that's the entire mechanism by which such an
    ID gets assigned. Comparing that column when checking for exact
    duplicates would therefore miss the single most realistic duplicate
    pattern there is, since the one column that's expected to legitimately
    differ is exactly the column being used to declare the rows different.

    Deliberately conservative: a column must be BOTH (a) unique on every
    row and (b) an integer column whose name looks like an identifier
    (id, customer_id, #, no, index, ...), so a genuinely meaningful column
    that happens to be fully unique (e.g. no two purchase amounts happen
    to collide) is never mistaken for a generated key.
    """
    id_cols = []
    for col in df.columns:
        if not _ID_NAME_PATTERN.search(str(col)):
            continue
        if not pd.api.types.is_integer_dtype(df[col]):
            continue
        if df[col].nunique(dropna=True) != len(df):
            continue
        id_cols.append(col)
    return id_cols


def _is_structured_text_column(series: pd.Series, min_share: float = 0.5) -> bool:
    """True when most values are e-mail addresses or code-like tokens
    (letters followed by digits). Near-identical strings in such columns
    (u1@mail.com vs u10@mail.com) are different entities, not typos, so a
    similarity-based duplicate check is the wrong tool for them."""
    vals = series.dropna().astype(str).str.strip()
    if vals.empty:
        return False
    hits = vals.apply(lambda v: bool(_EMAIL_PATTERN.match(v) or _CODE_PATTERN.match(v)))
    return float(hits.mean()) >= min_share


def _differs_only_in_digits(a: str, b: str) -> bool:
    """'user1' vs 'user10' differ only in their digits: that is a
    different identifier, not a misspelling of the same entry."""
    return re.sub(r"\d", "", a) == re.sub(r"\d", "", b) and a != b and bool(re.search(r"\d", a + b))


def detect_duplicates(df: pd.DataFrame, fuzzy_threshold: float = 0.92, max_fuzzy_rows: int = 2000) -> list[dict]:
    issues = []

    # --- Exact duplicates ---
    # Compare on every column EXCEPT detected ID-like columns — see
    # _detect_id_columns for why including them would defeat the purpose
    # of duplicate detection for the most common real-world case.
    id_cols = _detect_id_columns(df)
    compare_cols = [c for c in df.columns if c not in id_cols]

    if compare_cols:
        dup_mask = df.duplicated(subset=compare_cols, keep=False)
        if dup_mask.any():
            dup_df = df[dup_mask]
            for _, group in dup_df.groupby(compare_cols, dropna=False):
                indices = [int(i) for i in group.index.tolist()]
                if len(indices) < 2:
                    continue
                id_note = (
                    f" ({', '.join(id_cols)} differs, as expected for a re-submitted record)"
                    if id_cols else ""
                )
                issues.append({
                    "issue_id": str(uuid.uuid4()),
                    "issue_type": "duplicate",
                    "column": None,
                    "row_index": indices[0],
                    "row_indices": indices,
                    "severity": "medium",
                    "original_value": None,
                    "suggested_value": f"keep row {indices[0]}, drop {len(indices) - 1} other(s)",
                    "explanation": (
                        f"Rows {indices} are duplicates of one another across all "
                        f"{len(compare_cols)} non-identifier columns{id_note}. Suggestion: keep "
                        f"the first occurrence (row {indices[0]}) and remove the rest to avoid "
                        f"double-counting."
                    ),
                    "detected_by": "exact row hash comparison (excluding identifier columns)",
                    "confidence": 1.0,
                })

    # --- Fuzzy near-duplicates (only on a manageable sample size, on text columns) ---
    text_cols = [c for c in df.columns if df[c].dtype == object]
    if text_cols and len(df) <= max_fuzzy_rows:
        text_cols = [c for c in text_cols if not _is_structured_text_column(df[c])]
        key_col = _pick_identity_column(df, text_cols) if text_cols else None
        if key_col:
            seen = {}
            for idx, val in df[key_col].dropna().items():
                val_norm = str(val).strip().lower()
                match_idx = None
                for seen_val, seen_idx in seen.items():
                    ratio = SequenceMatcher(None, val_norm, seen_val).ratio()
                    if (ratio >= fuzzy_threshold and ratio < 1.0
                            and not _differs_only_in_digits(val_norm, seen_val)):
                        match_idx = seen_idx
                        break
                if match_idx is not None:
                    issues.append({
                        "issue_id": str(uuid.uuid4()),
                        "issue_type": "duplicate",
                        "column": key_col,
                        "row_index": int(idx),
                        "row_indices": [int(match_idx), int(idx)],
                        "severity": "low",
                        "original_value": val,
                        "suggested_value": df.at[match_idx, key_col],
                        "explanation": (
                            f"'{val}' in row {idx} is a near-duplicate of "
                            f"'{df.at[match_idx, key_col]}' in row {match_idx} "
                            f"(text similarity ≥ {fuzzy_threshold:.0%}), likely a typo "
                            f"or formatting variant of the same entry."
                        ),
                        "detected_by": "fuzzy string similarity (SequenceMatcher)",
                        "confidence": round(ratio, 2),
                    })
                else:
                    seen[val_norm] = idx

    return issues


def _pick_identity_column(df: pd.DataFrame, text_cols: list[str]) -> str | None:
    """Heuristically pick the column most likely to represent an identity
    (name/email/id) for fuzzy matching, preferring high-cardinality text columns."""
    best_col, best_ratio = None, 0.0
    for c in text_cols:
        n_unique = df[c].nunique(dropna=True)
        n_total = df[c].notna().sum()
        if n_total == 0:
            continue
        ratio = n_unique / n_total
        if ratio > best_ratio and ratio > 0.5:
            best_ratio = ratio
            best_col = c
    return best_col
