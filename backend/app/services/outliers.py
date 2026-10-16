"""
Outlier detection using Local Outlier Factor (LOF), with per-point
explanations derived from SHAP values so we can tell the user *which
columns* drove the anomaly score for *that specific row*.

LOF flags a point as anomalous based on how much less dense its
neighborhood is compared to its neighbors' neighborhoods — i.e. it
measures local isolation rather than how easily a point can be split off
by random partitioning (which is how Isolation Forest works). This makes
LOF particularly good at catching outliers that are only unusual *within
a specific local cluster*, even if they'd look unremarkable compared to
the dataset as a whole.
"""
import uuid
import numpy as np
import pandas as pd
from sklearn.neighbors import LocalOutlierFactor
from app.config import settings
from app.services.duplicates import _detect_id_columns


def detect_outliers(df: pd.DataFrame, contamination: float = None) -> list[dict]:
    # Row identifiers (customer_id, '#', ...) carry no information about
    # whether a row is unusual, but a unique, evenly spaced column adds a
    # dimension that distorts distances. They are detected with the same
    # rule as the duplicate detector and left out of LOF and SHAP.
    id_cols = set(_detect_id_columns(df))
    numeric_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c not in id_cols]
    if len(numeric_cols) == 0:
        return []

    numeric_df = df[numeric_cols].copy()

    # Rows with missing numeric values can't be scored fairly; impute
    # locally (median) purely for the purposes of outlier scoring —
    # this does NOT change the underlying dataset.
    fill_values = numeric_df.median(numeric_only=True)
    scoring_df = numeric_df.fillna(fill_values)

    if len(scoring_df) < 10 or scoring_df.shape[1] == 0:
        return []  # not enough data for a meaningful model

    contamination = contamination or settings.OUTLIER_CONTAMINATION
    # n_neighbors must be smaller than the number of samples. For LOF
    # specifically, using too LARGE a value relative to the dataset size
    # smooths out local density differences (in the extreme, if
    # n_neighbors ≈ n_rows, almost every point ends up in almost every
    # other point's neighborhood, so nothing looks locally unusual). We
    # scale it down for small datasets and cap it at 20 for larger ones.
    n_neighbors = min(20, max(5, len(scoring_df) // 2))
    n_neighbors = min(n_neighbors, len(scoring_df) - 1)
    # novelty=True is required so we can call .decision_function()/.predict()
    # after fitting (needed both for scoring and for SHAP's explainer to
    # probe the model) — otherwise LOF only exposes fit_predict().
    model = LocalOutlierFactor(
        n_neighbors=n_neighbors,
        contamination=contamination,
        novelty=True,
    )
    model.fit(scoring_df.values)
    preds = model.predict(scoring_df.values)          # -1 = outlier, 1 = normal
    scores = model.decision_function(scoring_df.values)  # lower = more anomalous

    outlier_positions = np.where(preds == -1)[0]
    if len(outlier_positions) == 0:
        return []

    # Confidence and severity are computed RELATIVE to this dataset's own
    # score distribution, not a fixed absolute scale. LOF's score range is
    # dataset-dependent and unbounded (unlike Isolation Forest's roughly
    # fixed [-0.5, 0.5] range that a fixed multiplier used to be tuned
    # for), so a fixed cutoff saturates almost every flagged point to the
    # same maximum confidence/severity regardless of how strong the
    # anomaly actually is — exactly what was happening before this fix:
    # a score of -114 (extremely obvious outlier) and a score of -0.46
    # (a borderline, likely-false-positive case) both showed 100%
    # confidence and "high" severity, making both numbers meaningless.
    score_min = float(scores.min())   # most anomalous point in this dataset
    score_max = float(scores.max())   # most "normal" point in this dataset
    score_range = score_max - score_min

    def relative_strength(score: float) -> float:
        if score_range <= 1e-9:
            return 1.0
        return max(0.0, min(1.0, (score_max - score) / score_range))

    shap_values = _compute_shap_safe(model, scoring_df, outlier_positions)

    issues = []
    col_std = scoring_df.std(numeric_only=True).replace(0, 1e-9)
    col_mean = scoring_df.mean(numeric_only=True)
    col_min = scoring_df.min(numeric_only=True)

    for pos in outlier_positions:
        row_idx = int(scoring_df.index[pos])
        anomaly_score = float(scores[pos])
        strength = relative_strength(anomaly_score)

        if shap_values is not None and int(pos) in shap_values:
            contributions = shap_values[int(pos)]
            top_col_positions = np.argsort(-np.abs(contributions))[:2]
            driver_cols = [numeric_cols[i] for i in top_col_positions]
            driver_desc = ", ".join(
                f"{c} (value={scoring_df.iloc[pos][c]:.3g}, "
                f"{abs((scoring_df.iloc[pos][c]-col_mean[c])/col_std[c]):.1f}σ from mean, "
                f"SHAP contribution={contributions[i]:+.3f})"
                for i, c in zip(top_col_positions, driver_cols)
            )
            method = "Local Outlier Factor + SHAP (KernelExplainer)"
        else:
            # Fallback: rank columns by z-score distance if SHAP fails/unavailable
            row = scoring_df.iloc[pos]
            z = ((row - col_mean) / col_std).abs().sort_values(ascending=False)
            driver_cols = z.index[:2].tolist()
            driver_desc = ", ".join(
                f"{c} (value={row[c]:.3g}, {z[c]:.1f}σ from mean)" for c in driver_cols
            )
            method = "Local Outlier Factor + z-score fallback"

        severity = "high" if strength >= 0.66 else ("medium" if strength >= 0.33 else "low")

        plain_explanation = _build_plain_explanation(
            row_idx, driver_cols, scoring_df.iloc[pos], col_mean, col_std, col_min
        )

        issues.append({
            "issue_id": str(uuid.uuid4()),
            "issue_type": "outlier",
            "column": driver_cols[0],
            "row_index": row_idx,
            "row_indices": None,
            "severity": severity,
            "original_value": {c: float(scoring_df.iloc[pos][c]) for c in driver_cols},
            "suggested_value": "review manually or cap at column's 1st/99th percentile",
            "explanation": (
                f"{plain_explanation} "
                f"(Technical details: Local Outlier Factor anomaly score {anomaly_score:.3f}, "
                f"more negative = more unusual, relative to the {len(scoring_df)} rows scored here. "
                f"{driver_desc})"
            ),
            "detected_by": method,
            "confidence": round(strength, 2),
        })

    return issues


def _fmt_num(value: float) -> str:
    """Formats a number the way a person would write it by hand — no
    scientific notation, no unnecessary decimal places."""
    if float(value).is_integer():
        return f"{value:,.0f}"
    if abs(value) >= 100:
        return f"{value:,.0f}"
    if abs(value) >= 1:
        return f"{value:,.1f}"
    return f"{value:.2f}"


def _build_plain_explanation(row_idx, driver_cols, row, col_mean, col_std, col_min) -> str:
    """
    Produces a plain-English, non-technical explanation of why a row was
    flagged, leading with the single most influential column instead of
    statistical jargon. Technical figures (standard deviations, SHAP
    values) are appended separately by the caller for anyone who wants
    them, rather than being the headline of the message.
    """
    main_col = driver_cols[0]
    value = row[main_col]
    mean = col_mean[main_col]
    direction = "higher" if value > mean else "lower"

    typical_low = mean - col_std[main_col]
    typical_high = mean + col_std[main_col]

    # A "typical range" computed as mean ± 1 standard deviation can dip
    # below zero purely because of a wide spread (e.g. population sizes
    # ranging from tiny nations to over a billion people). For a column
    # that has never actually contained a negative value in this dataset
    # (population, case counts, deaths, prices...), showing a negative
    # lower bound reads as nonsensical rather than informative — so we
    # clamp it to the column's real observed minimum (never below 0)
    # instead of the raw statistical bound.
    if col_min[main_col] >= 0:
        typical_low = max(typical_low, 0)

    sentence = (
        f"Row {row_idx} looks unusual mainly because of its '{main_col}' value "
        f"({_fmt_num(value)}), which is much {direction} than most rows "
        f"(typical range is roughly {_fmt_num(typical_low)}–{_fmt_num(typical_high)})."
    )

    if len(driver_cols) > 1:
        second_col = driver_cols[1]
        sentence += f" '{second_col}' was also somewhat unusual, but mattered less."

    return sentence


def _compute_shap_safe(model, scoring_df: pd.DataFrame, positions, max_explain: int = 200):
    """
    Computes SHAP values for the flagged rows only, using KernelExplainer
    on LOF's decision function. Returns {row_position: contributions}, or
    None if SHAP is unavailable/fails, in which case the caller falls back
    to z-score ranking so the pipeline never breaks because of the
    explainability layer.

    Notes:
    - Only flagged rows are explained (at most `max_explain`, most
      anomalous first is not guaranteed; callers fall back to z-scores
      for rows without SHAP values) which keeps runtime bounded on large
      files.
    - KernelExplainer is used on purpose: shap.Explainer's automatic
      choice picks the Exact explainer for 3-10 columns, which needs
      2^n evaluations and fails under a small evaluation budget, and that
      silently forced the z-score fallback for most real datasets.
    """
    try:
        import shap
        import warnings
        n_features = scoring_df.shape[1]
        background = scoring_df.sample(
            min(len(scoring_df), 100), random_state=settings.RANDOM_STATE
        ).values
        positions = [int(p) for p in positions][:max_explain]
        if not positions:
            return {}
        decision_fn = lambda x: model.decision_function(x)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            explainer = shap.KernelExplainer(decision_fn, background)
            vals = explainer.shap_values(
                scoring_df.values[positions],
                nsamples=min(2 * n_features + 256, 1024),
                silent=True,
            )
        vals = np.asarray(vals).reshape(len(positions), n_features)
        return {p: vals[k] for k, p in enumerate(positions)}
    except Exception:
        return None
