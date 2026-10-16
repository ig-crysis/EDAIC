"""
Computes a composite Data Quality Score from four sub-dimensions:
completeness, uniqueness, validity, and consistency.
"""
import pandas as pd


def compute_quality_score(df: pd.DataFrame, issues: list[dict]) -> dict:
    n_rows = len(df)
    n_cols = len(df.columns)
    total_cells = max(n_rows * n_cols, 1)

    # Completeness: fraction of non-null cells
    n_missing = int(df.isna().sum().sum())
    completeness = 1 - (n_missing / total_cells)

    # Uniqueness: fraction of rows that are NOT part of a duplicate group
    dup_row_indices = set()
    for issue in issues:
        if issue["issue_type"] == "duplicate" and issue.get("row_indices"):
            dup_row_indices.update(issue["row_indices"])
    uniqueness = 1 - (len(dup_row_indices) / n_rows if n_rows else 0)

    # Validity: fraction of rows NOT flagged as anomalous (numeric outliers,
    # rare categories, implausible dates)
    outlier_rows = {i["row_index"] for i in issues
                    if i["issue_type"] in ("outlier", "rare_category", "date_anomaly", "pattern_violation",
                                    "range_violation", "temporal_anomaly")}
    validity = 1 - (len(outlier_rows) / n_rows if n_rows else 0)

    # Consistency: fraction of rows NOT flagged for inconsistent formatting
    inconsistent_rows = {i["row_index"] for i in issues if i["issue_type"] == "inconsistent_value"}
    consistency = 1 - (len(inconsistent_rows) / n_rows if n_rows else 0)

    overall = (
        0.35 * completeness +
        0.20 * uniqueness +
        0.25 * validity +
        0.20 * consistency
    )

    return {
        "completeness": round(max(0, completeness) * 100, 2),
        "uniqueness": round(max(0, uniqueness) * 100, 2),
        "validity": round(max(0, validity) * 100, 2),
        "consistency": round(max(0, consistency) * 100, 2),
        "overall_score": round(max(0, overall) * 100, 2),
    }
