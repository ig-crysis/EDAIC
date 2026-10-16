"""
Orchestrates the full analysis pipeline (running all detectors) and the
cleaning-application step (applying user-accepted suggestions to produce
a cleaned dataset).
"""
import re
import pandas as pd

from app.services.missing_values import detect_missing_values
from app.services.duplicates import detect_duplicates
from app.services.outliers import detect_outliers
from app.services.inconsistencies import detect_inconsistencies
from app.services.categorical_dates import detect_categorical_and_date_anomalies
from app.services.rules import detect_rule_violations
from app.services.temporal import detect_temporal_anomalies
from app.services.quality_score import compute_quality_score
from app.services.preprocessing import numeric_coerced_view
from app.services.adaptive import current_contamination

_VALID_COMMA_GROUPING = re.compile(r"^\s*-?\d{1,3}(,\d{3})+(\.\d+)?\s*$")


def analyze_dataset(df: pd.DataFrame, contamination: float | None = None, rules: list[dict] | None = None) -> dict:
    """Runs every detector and returns issues + quality score.

    `contamination` controls how sensitive outlier detection is. If not
    given explicitly, the current adaptively-tuned value is used (see
    app.services.adaptive) — this is how accept/reject feedback from past
    reviews actually changes future analyses, instead of just being
    logged and ignored.
    """
    # Missing-value imputation and outlier detection need to know a
    # column is genuinely numeric to work correctly (see preprocessing.py
    # docstring). Duplicate and inconsistency checks intentionally keep
    # using the original, literal text values.
    numeric_view = numeric_coerced_view(df)

    resolved_contamination = contamination if contamination is not None else current_contamination()

    issues = []
    issues += detect_missing_values(numeric_view)
    issues += detect_duplicates(df)
    issues += detect_outliers(numeric_view, contamination=resolved_contamination)
    issues += detect_inconsistencies(df)
    issues += detect_categorical_and_date_anomalies(df)
    issues += detect_rule_violations(df, rules)
    issues += detect_temporal_anomalies(numeric_view)

    score = compute_quality_score(df, issues)
    return {"issues": issues, "quality_score": score, "outlier_contamination_used": resolved_contamination}


def apply_cleaning(
    df: pd.DataFrame,
    issues: list[dict],
    accepted_issue_ids: list[str] | None = None,
    rejected_issue_ids: list[str] | None = None,
) -> tuple[pd.DataFrame, int]:
    """
    Applies suggested fixes to a copy of the dataframe.
    - If accepted_issue_ids is None, ALL non-rejected issues are applied.
    - rejected_issue_ids are always skipped.
    """
    cleaned = df.copy()
    rejected = set(rejected_issue_ids or [])
    n_applied = 0

    rows_to_drop = set()
    cols_to_drop = set()

    for issue in issues:
        if issue["issue_id"] in rejected:
            continue
        if accepted_issue_ids is not None and issue["issue_id"] not in accepted_issue_ids:
            continue

        itype = issue["issue_type"]

        if itype == "missing_value":
            col, row = issue["column"], issue["row_index"]
            if row in cleaned.index and pd.isna(cleaned.at[row, col]):
                cleaned.at[row, col] = _format_to_match_column(cleaned[col], issue["suggested_value"])
                n_applied += 1

        elif itype == "duplicate":
            indices = issue.get("row_indices") or []
            if len(indices) > 1:
                # Keep the first, drop the rest
                rows_to_drop.update(indices[1:])
                n_applied += 1

        elif itype == "inconsistent_value":
            col, row = issue["column"], issue["row_index"]
            if row in cleaned.index and issue["suggested_value"] is not None:
                cleaned.at[row, col] = issue["suggested_value"]
                n_applied += 1

        elif itype == "sparse_column":
            # Dropping a column removes data, so it is only done on an
            # explicit accept, never as part of "apply all defaults".
            col = issue.get("column")
            if accepted_issue_ids is not None and col in cleaned.columns:
                cols_to_drop.add(col)
                n_applied += 1

        elif itype == "rare_category":
            col, row, sug = issue.get("column"), issue.get("row_index"), issue.get("suggested_value")
            if (accepted_issue_ids is not None and row in cleaned.index
                    and isinstance(sug, str) and sug != "review manually"):
                cleaned.at[row, col] = sug
                n_applied += 1

        elif itype in ("date_anomaly", "pattern_violation", "range_violation", "temporal_anomaly"):
            pass  # flagged for manual review only; the right value is unknown, so nothing is changed automatically

        elif itype == "outlier":
            # Outliers are flagged for manual review by default (capping
            # is offered as the suggestion but we don't silently overwrite
            # domain data unless explicitly accepted).
            col = issue.get("column")
            row = issue["row_index"]
            if accepted_issue_ids is not None and col and row in cleaned.index:
                series = cleaned[col].dropna()
                if pd.api.types.is_numeric_dtype(series):
                    lower, upper = series.quantile(0.01), series.quantile(0.99)
                    cleaned.at[row, col] = min(max(cleaned.at[row, col], lower), upper)
                    n_applied += 1

    if cols_to_drop:
        cleaned = cleaned.drop(columns=list(cols_to_drop))
    if rows_to_drop:
        cleaned = cleaned.drop(index=list(rows_to_drop)).reset_index(drop=True)

    return cleaned, n_applied


def _format_to_match_column(column: pd.Series, value) -> object:
    """
    When filling a missing value into a column whose OTHER entries are
    comma-formatted numbers stored as text (e.g. '12,345'), format the
    fill value the same way ('5,689' rather than '5689.0') so the
    cleaned column looks consistent rather than mixing styles.
    Non-numeric fills, or columns that aren't comma-formatted text, are
    returned unchanged.
    """
    if not isinstance(value, (int, float)):
        return value

    existing_values = column.dropna().astype(str)
    looks_comma_formatted = existing_values.apply(
        lambda v: bool(_VALID_COMMA_GROUPING.match(v))
    ).any()

    if not looks_comma_formatted:
        return value

    if float(value).is_integer():
        return f"{value:,.0f}"
    return f"{value:,.2f}"
