import os
os.environ["USE_MOCK_DB"] = "true"  # ensure tests never touch a real MongoDB
# (cleaning.py now pulls the adaptive-loop's current contamination value
# from the database on every analyze_dataset() call, so this must be set
# before any app module is imported here, same as in test_api.py.)

import pandas as pd
import numpy as np
import pytest

from app.services.missing_values import detect_missing_values
from app.services.duplicates import detect_duplicates
from app.services.outliers import detect_outliers
from app.services.inconsistencies import detect_inconsistencies
from app.services.quality_score import compute_quality_score
from app.services.cleaning import analyze_dataset, apply_cleaning
from app.services.adaptive import (
    get_adaptive_state,
    reset_adaptive_state,
    record_feedback,
    current_contamination,
    CONTAMINATION_MIN,
    CONTAMINATION_MAX,
    ACCEPT_THRESHOLD,
    REJECT_THRESHOLD,
    BATCH_SIZE,
)


@pytest.fixture
def dirty_df():
    return pd.DataFrame({
        "id": range(1, 21),
        "name": ["Alice", "alice", "Bob", "Bob", "Carol"] * 4,
        "age": [25, 25, 30, 30, np.nan] * 4,
        "amount": [10, 12, 11, 13, 10000] + [10, 12, 11, 13, 9] * 3,
    })


def test_detect_missing_values_flags_nulls(dirty_df):
    issues = detect_missing_values(dirty_df)
    assert len(issues) == 4  # 4 NaNs in 'age'
    assert all(i["issue_type"] == "missing_value" for i in issues)
    assert all(i["column"] == "age" for i in issues)


def test_detect_missing_values_no_nulls():
    df = pd.DataFrame({"a": [1, 2, 3]})
    assert detect_missing_values(df) == []


def test_detect_duplicates_exact():
    df = pd.DataFrame({"a": [1, 1, 2], "b": ["x", "x", "y"]})
    issues = detect_duplicates(df)
    dup_issues = [i for i in issues if i["issue_type"] == "duplicate"]
    assert len(dup_issues) >= 1
    assert set(dup_issues[0]["row_indices"]) == {0, 1}


def test_detect_duplicates_ignores_id_column_difference():
    """Regression test: two rows identical in every real-world column but
    with DIFFERENT auto-incrementing IDs must still be caught as
    duplicates. A generated ID is expected to differ for a re-submitted
    record — that's the most common real-world duplicate pattern, and
    comparing the ID column would defeat detection for exactly that case."""
    df = pd.DataFrame({
        "customer_id": [1, 2, 3],
        "name": ["John Smith", "Jane Doe", "John Smith"],
        "age": [29, 34, 29],
        "email": ["john@x.com", "jane@x.com", "john@x.com"],
    })
    issues = detect_duplicates(df)
    dup_issues = [i for i in issues if i["issue_type"] == "duplicate" and i["row_indices"] == [0, 2]]
    assert len(dup_issues) == 1
    assert "customer_id" in dup_issues[0]["explanation"]


def test_detect_duplicates_does_not_exclude_meaningful_unique_column():
    """A fully-unique column should only be excluded from duplicate
    comparison when it also LOOKS like a generated identifier (by name).
    A genuinely meaningful column that happens to be fully unique (e.g. by
    coincidence, in a small dataset) must still be compared normally."""
    df = pd.DataFrame({
        "customer_id": [1, 2],
        "name": ["Alice", "Alice"],
        "score": [10, 20],  # fully unique, but NOT id-like by name
    })
    issues = detect_duplicates(df)
    dup_issues = [i for i in issues if i["issue_type"] == "duplicate"]
    # Rows differ on 'score', a real (non-ID) column, so they must NOT be
    # flagged as duplicates.
    assert len(dup_issues) == 0


def test_detect_duplicates_fuzzy_name():
    # Distinct rows overall, but the identity column has a likely typo
    # ("Jon Smith" vs "John Smith") that fuzzy matching should catch.
    df = pd.DataFrame({
        "name": ["John Smith", "Jon Smith", "Amy White", "Sara Lee"],
        "value": [1, 2, 3, 4],
    })
    issues = detect_duplicates(df)
    assert any(i["issue_type"] == "duplicate" for i in issues)


def test_detect_duplicates_fuzzy_skips_email_and_code_columns():
    # E-mail addresses and code-like tokens that differ by a few characters
    # are different entities, not typos, so they must not be flagged.
    df = pd.DataFrame({
        "email": [f"u{i}@mail.com" for i in range(1, 40)],
        "value": list(range(1, 40)),
    })
    assert detect_duplicates(df) == []


def test_detect_outliers_finds_extreme_value():
    np.random.seed(0)
    normal = np.random.normal(50, 5, 100)
    data = np.append(normal, [5000])  # one obvious outlier
    df = pd.DataFrame({"value": data, "other": np.random.normal(10, 1, 101)})
    issues = detect_outliers(df, contamination=0.05)
    flagged_rows = {i["row_index"] for i in issues}
    assert 100 in flagged_rows  # the injected outlier's index


def test_detect_outliers_too_few_rows_returns_empty():
    df = pd.DataFrame({"value": [1, 2, 3]})
    assert detect_outliers(df) == []


def test_detect_inconsistencies_casing():
    df = pd.DataFrame({"city": ["Chicago", "chicago", "CHICAGO", "Boston"]})
    issues = detect_inconsistencies(df)
    assert any(i["issue_type"] == "inconsistent_value" for i in issues)


def test_detect_inconsistencies_date_formats():
    df = pd.DataFrame({"d": ["2023-01-01", "2023-01-02", "2023-01-03", "05/01/2023"]})
    issues = detect_inconsistencies(df)
    assert any(i["column"] == "d" for i in issues)


def test_detect_inconsistencies_ambiguous_slash_date_flagged_once():
    """Regression test: DD/MM/YYYY and MM/DD/YYYY share an identical regex
    pattern, so a single value like '15/01/2023' must be flagged exactly
    once, not twice."""
    df = pd.DataFrame({"signup_date": [
        "2023-01-15", "2023-01-16", "2023-01-18", "15/01/2023",
    ]})
    issues = detect_inconsistencies(df)
    date_issues_for_row3 = [i for i in issues if i["column"] == "signup_date" and i["row_index"] == 3]
    assert len(date_issues_for_row3) == 1
    assert date_issues_for_row3[0]["suggested_value"] == "2023-01-15"


def test_detect_inconsistencies_comma_thousands_separator_not_flagged():
    """Regression test: a column mixing small plain numbers ('523') with
    large comma-formatted numbers ('1,234,567') is normal, valid
    formatting — not an inconsistency — even though the values don't all
    look alike as strings. This previously caused a real dataset (COVID
    case counts) to have ~90% of its rows falsely flagged."""
    df = pd.DataFrame({
        "Total Cases": ["1,234,567", "987,654", "456,789", "523", "12"],
    })
    issues = detect_inconsistencies(df)
    assert len(issues) == 0


def test_detect_inconsistencies_still_catches_genuine_numeric_formatting_issues():
    """Malformed numeric formatting (stray units, wrong comma grouping)
    must still be caught even after excluding valid thousands separators."""
    df = pd.DataFrame({"value": ["1,234,567", "523", "45kg", "12,34,567", "100"]})
    issues = detect_inconsistencies(df)
    flagged_values = {i["original_value"] for i in issues}
    assert "45kg" in flagged_values
    assert "12,34,567" in flagged_values
    assert "1,234,567" not in flagged_values
    assert "523" not in flagged_values


def test_comma_formatted_numeric_column_gets_proper_numeric_imputation():
    """Regression test: a numeric column stored as text because some
    values use thousands-separator commas (e.g. '12,345') must still be
    imputed using a numeric strategy (mean/median), not the categorical
    'mode' strategy — and outliers in it must not be silently skipped.
    This previously caused a real dataset (COVID death counts) to get a
    near-meaningless fill suggestion at only 1.8% confidence."""
    from app.services.cleaning import analyze_dataset

    df = pd.DataFrame({
        "Total Deaths": ["12,345", "9,876", None, "523", "12", "8,765", "9,111", None],
    })
    result = analyze_dataset(df)
    missing_issues = [i for i in result["issues"] if i["issue_type"] == "missing_value"]
    assert len(missing_issues) == 2
    for issue in missing_issues:
        assert "mode" not in issue["detected_by"]
        assert isinstance(issue["suggested_value"], (int, float))


def test_missing_value_fill_matches_comma_formatted_column_style():
    """The value written back into a comma-formatted numeric-as-text
    column should itself be comma-formatted, not a bare float like
    '5689.0', so the cleaned column doesn't mix styles."""
    from app.services.cleaning import analyze_dataset, apply_cleaning

    df = pd.DataFrame({
        "Total Deaths": ["12,345", "9,876", None, "8,765", "9,111"],
    })
    result = analyze_dataset(df)
    cleaned, n_applied = apply_cleaning(df, result["issues"], accepted_issue_ids=None)
    assert n_applied >= 1
    filled_value = cleaned.loc[2, "Total Deaths"]
    assert "," in str(filled_value)
    assert ".0" not in str(filled_value)


def test_quality_score_perfect_dataset():
    df = pd.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})
    score = compute_quality_score(df, issues=[])
    assert score["overall_score"] == 100.0


def test_quality_score_penalizes_missing():
    df = pd.DataFrame({"a": [1, None, 3]})
    issues = detect_missing_values(df)
    score = compute_quality_score(df, issues)
    assert score["completeness"] < 100.0


def test_full_pipeline_analyze_and_clean(dirty_df):
    result = analyze_dataset(dirty_df)
    assert "issues" in result and "quality_score" in result
    assert len(result["issues"]) > 0

    cleaned, n_applied = apply_cleaning(dirty_df, result["issues"], accepted_issue_ids=None)
    assert n_applied > 0
    # No missing 'age' values should remain in the affected rows
    assert cleaned["age"].isna().sum() < dirty_df["age"].isna().sum()


def test_apply_cleaning_respects_rejected_ids(dirty_df):
    result = analyze_dataset(dirty_df)
    # Reject BOTH missing-value fixes AND duplicate removals, so we isolate
    # what this test actually checks (missing-value rejection) from
    # duplicate-row removal changing the row count for an unrelated reason.
    # (The dirty_df fixture's repeating pattern now correctly produces real
    # duplicate rows once ID-like columns are excluded from comparison —
    # see detect_duplicates — so leaving duplicates un-rejected here would
    # remove some of the very rows this test is checking for NaN ages.)
    rejected_ids = [i["issue_id"] for i in result["issues"] if i["issue_type"] in ("missing_value", "duplicate")]
    cleaned, n_applied = apply_cleaning(
        dirty_df, result["issues"],
        accepted_issue_ids=None,
        rejected_issue_ids=rejected_ids,
    )
    # Rejected missing-value fixes should NOT be applied
    assert cleaned["age"].isna().sum() == dirty_df["age"].isna().sum()


def test_outlier_explanation_never_shows_negative_range_for_always_positive_column():
    """Regression test: a column that has never contained a negative
    value in the data (e.g. country population) must never show a
    nonsensical negative 'typical range' in its plain-English outlier
    explanation, even though mean-minus-one-std-dev can go below zero
    when the column has a wide spread."""
    import numpy as np
    from app.services.outliers import detect_outliers

    np.random.seed(0)
    populations = list(np.random.randint(500_000, 50_000_000, 40)) + [1_406_631_776]
    df = pd.DataFrame({
        "Population": populations,
        "Other": np.random.randint(1000, 5_000_000, 41),
    })
    issues = detect_outliers(df)
    pop_issues = [i for i in issues if i["column"] == "Population"]
    assert len(pop_issues) > 0
    for issue in pop_issues:
        assert "typical range is roughly -" not in issue["explanation"]


def test_outlier_explanation_keeps_negative_range_when_data_actually_has_negatives():
    """A column that DOES legitimately contain negative values (e.g.
    profit/loss) should still show a real negative lower bound — the
    fix above must not over-correct and hide genuine negative ranges."""
    import numpy as np
    from app.services.outliers import detect_outliers

    np.random.seed(1)
    values = list(np.random.normal(0, 100, 40)) + [5000]
    df = pd.DataFrame({
        "profit_loss": values,
        "other": np.random.normal(50, 10, 41),
    })
    issues = detect_outliers(df)
    pl_issues = [i for i in issues if i["column"] == "profit_loss"]
    assert len(pl_issues) > 0
    assert any("typical range is roughly -" in i["explanation"] for i in pl_issues)


def test_outlier_confidence_reflects_relative_anomaly_strength():
    """Regression test: confidence/severity must be computed RELATIVE to
    the dataset's own score distribution, not a fixed absolute cutoff.
    LOF's score scale is dataset-dependent and unbounded (unlike
    Isolation Forest's roughly fixed range that the old fixed-multiplier
    formula was tuned for), so a fixed cutoff previously saturated almost
    every flagged point to 100% confidence / 'high' severity regardless
    of how strong the anomaly actually was — making both numbers
    meaningless. An obvious, extreme outlier must show clearly higher
    confidence than a borderline one flagged only because sensitivity
    was turned up."""
    import numpy as np
    from app.services.outliers import detect_outliers

    np.random.seed(0)
    # One extremely obvious outlier (huge, unmistakable) plus a mildly
    # unusual point that should only get flagged at higher sensitivity.
    values = list(np.random.normal(50, 5, 40)) + [500, 68]
    df = pd.DataFrame({
        "value": values,
        "other": np.random.normal(10, 1, 42),
    })
    issues = detect_outliers(df, contamination=0.10)
    by_row = {i["row_index"]: i for i in issues}
    assert 40 in by_row  # the extreme point (500)
    extreme_confidence = by_row[40]["confidence"]
    assert extreme_confidence >= 0.9
    assert by_row[40]["severity"] == "high"

    # If a second, much milder point also got flagged, it must show
    # meaningfully lower confidence than the extreme one — not the same
    # saturated 1.0 the old fixed-cutoff formula would have given both.
    if 41 in by_row:
        assert by_row[41]["confidence"] < extreme_confidence


# ---------------------------------------------------------------------
# Adaptive feedback loop
# ---------------------------------------------------------------------

@pytest.fixture(autouse=False)
def clean_adaptive_state():
    """Each adaptive test starts from a fresh, default state so tests
    don't leak contamination adjustments into each other."""
    reset_adaptive_state()
    yield
    reset_adaptive_state()


def test_adaptive_state_has_sane_defaults(clean_adaptive_state):
    state = get_adaptive_state()
    assert CONTAMINATION_MIN <= state["contamination"] <= CONTAMINATION_MAX
    assert state["total_outlier_decisions"] == 0
    assert state["accepted_outlier_decisions"] == 0
    assert state["rejected_outlier_decisions"] == 0
    assert state["history"] == []


def test_non_outlier_feedback_is_logged_but_never_adjusts_contamination(clean_adaptive_state):
    before = current_contamination()
    for _ in range(BATCH_SIZE * 3):
        record_feedback("ds1", "missing_value", "issue-x", accepted=False)
    state = get_adaptive_state()
    assert state["contamination"] == before
    assert state["total_outlier_decisions"] == 0
    assert state["history"] == []


def test_mostly_accepted_outliers_raise_sensitivity(clean_adaptive_state):
    before = current_contamination()
    for _ in range(BATCH_SIZE):
        record_feedback("ds1", "outlier", "issue-x", accepted=True)
    state = get_adaptive_state()
    assert state["contamination"] > before
    assert state["contamination"] <= CONTAMINATION_MAX
    assert len(state["history"]) == 1
    assert state["history"][0]["from"] == before
    assert state["history"][0]["to"] == state["contamination"]
    assert current_contamination() == state["contamination"]


def test_mostly_rejected_outliers_lower_sensitivity(clean_adaptive_state):
    before = current_contamination()
    for _ in range(BATCH_SIZE):
        record_feedback("ds1", "outlier", "issue-x", accepted=False)
    state = get_adaptive_state()
    assert state["contamination"] < before
    assert state["contamination"] >= CONTAMINATION_MIN


def test_mixed_feedback_near_neutral_does_not_adjust(clean_adaptive_state):
    before = current_contamination()
    # 2 accepted, 3 rejected out of a 5-batch -> 40% accept rate, inside
    # the neutral band (between REJECT_THRESHOLD and ACCEPT_THRESHOLD).
    decisions = [True, True, False, False, False]
    assert REJECT_THRESHOLD < (sum(decisions) / len(decisions)) < ACCEPT_THRESHOLD
    for accepted in decisions:
        record_feedback("ds1", "outlier", "issue-x", accepted=accepted)
    state = get_adaptive_state()
    assert state["contamination"] == before
    assert state["history"] == []


def test_contamination_stays_within_bounds_after_many_batches(clean_adaptive_state):
    # Hammer it with all-accepted batches well past the point where it
    # would exceed CONTAMINATION_MAX without clamping.
    for _ in range(BATCH_SIZE * 30):
        record_feedback("ds1", "outlier", "issue-x", accepted=True)
    assert current_contamination() <= CONTAMINATION_MAX


def test_reset_adaptive_state_returns_to_default(clean_adaptive_state):
    default = current_contamination()
    for _ in range(BATCH_SIZE):
        record_feedback("ds1", "outlier", "issue-x", accepted=True)
    assert current_contamination() != default
    reset_adaptive_state()
    assert current_contamination() == default
    state = get_adaptive_state()
    assert state["total_outlier_decisions"] == 0
    assert state["history"] == []


def test_analyze_dataset_uses_adaptive_contamination(clean_adaptive_state, dirty_df):
    # Push contamination to a custom, non-default value, then confirm
    # analyze_dataset() actually picks it up instead of the fixed default
    # unless explicitly overridden.
    for _ in range(BATCH_SIZE):
        record_feedback("ds1", "outlier", "issue-x", accepted=True)
    adjusted = current_contamination()
    result = analyze_dataset(dirty_df)
    assert result["outlier_contamination_used"] == adjusted

    # An explicit override still wins over the adaptive value.
    result_override = analyze_dataset(dirty_df, contamination=0.05)
    assert result_override["outlier_contamination_used"] == 0.05


# ---------------------------------------------------------------------------
# Post-review improvements
# ---------------------------------------------------------------------------
import numpy as np
from app.services.missing_values import detect_missing_values
from app.services.inconsistencies import detect_inconsistencies
from app.services.categorical_dates import detect_categorical_and_date_anomalies
from app.services.cleaning import apply_cleaning


def test_outliers_ignore_identifier_column():
    rng = np.random.default_rng(0)
    df = pd.DataFrame({
        "customer_id": range(1, 61),
        "amount": rng.normal(100, 5, 60),
    })
    df.loc[10, "amount"] = 900
    issues = detect_outliers(df)
    assert issues, "the extreme amount should still be found"
    for i in issues:
        assert "customer_id" not in i["original_value"]
        assert i["column"] == "amount"


def test_casing_tie_prefers_title_case():
    df = pd.DataFrame({"city": ["Boston", "boston", "Chicago", "Chicago", "Chicago"]})
    issues = [i for i in detect_inconsistencies(df) if i["issue_type"] == "inconsistent_value"]
    assert len(issues) == 1
    assert issues[0]["original_value"] == "boston"
    assert issues[0]["suggested_value"] == "Boston"


def test_sparse_column_gets_one_issue_and_no_fill():
    df = pd.DataFrame({"a": range(20), "b": [None] * 19 + [5.0]})
    issues = detect_missing_values(df)
    kinds = [i["issue_type"] for i in issues]
    assert kinds == ["sparse_column"]
    assert issues[0]["column"] == "b"


def test_sparse_column_dropped_only_on_explicit_accept():
    df = pd.DataFrame({"a": range(20), "b": [None] * 19 + [5.0]})
    issues = detect_missing_values(df)
    kept, _ = apply_cleaning(df, issues)  # "apply all defaults"
    assert "b" in kept.columns
    dropped, n = apply_cleaning(df, issues, accepted_issue_ids=[issues[0]["issue_id"]])
    assert "b" not in dropped.columns and n == 1


def test_rare_category_flags_typo_and_suggests_common_value():
    vals = ["Delivered"] * 60 + ["Pending"] * 30 + ["Cancelled"] * 9 + ["Delivred"]
    df = pd.DataFrame({"status": vals})
    issues = [i for i in detect_categorical_and_date_anomalies(df) if i["issue_type"] == "rare_category"]
    assert len(issues) == 1
    assert issues[0]["original_value"] == "Delivred"
    assert issues[0]["suggested_value"] == "Delivered"


def test_rare_category_ignores_free_text_and_small_tables():
    free = pd.DataFrame({"note": [f"comment number {i}" for i in range(60)]})
    assert detect_categorical_and_date_anomalies(free) == []
    small = pd.DataFrame({"s": ["a", "a", "b"]})
    assert detect_categorical_and_date_anomalies(small) == []


def test_date_anomaly_flags_far_outlier_date():
    dates = [f"2023-03-{d:02d}" for d in range(1, 21)] + ["1850-01-01"]
    df = pd.DataFrame({"when": dates})
    issues = [i for i in detect_categorical_and_date_anomalies(df) if i["issue_type"] == "date_anomaly"]
    assert [i["original_value"] for i in issues] == ["1850-01-01"]


def test_date_anomaly_is_never_changed_automatically():
    dates = [f"2023-03-{d:02d}" for d in range(1, 21)] + ["1850-01-01"]
    df = pd.DataFrame({"when": dates})
    issues = detect_categorical_and_date_anomalies(df)
    cleaned, n = apply_cleaning(df, issues, accepted_issue_ids=[i["issue_id"] for i in issues])
    assert cleaned["when"].tolist() == dates and n == 0


from app.services.adaptive import update_config


def test_recent_decisions_count_more_than_old_ones(clean_adaptive_state):
    update_config({"batch_size": 5})
    for _ in range(40):                       # a long history of accepting
        record_feedback("ds1", "outlier", "x", accepted=True)
    start = get_adaptive_state()["contamination"]
    for _ in range(30):                       # then the reviewer changes behaviour
        record_feedback("ds1", "outlier", "x", accepted=False)
    state = get_adaptive_state()
    assert state["contamination"] < start, "recent rejections must be able to pull sensitivity back down"
    # with plain cumulative counts the 40 old accepts would still dominate
    assert state["accepted_outlier_decisions"] > state["rejected_outlier_decisions"]


def test_reversed_decisions_hold_the_sensitivity(clean_adaptive_state):
    before = get_adaptive_state()["contamination"]
    for k in range(5):                        # first pass: reject five cells
        record_feedback("ds1", "outlier", f"a{k}", accepted=False, column="amount", row_index=k)
    after_first = get_adaptive_state()["contamination"]
    for k in range(5):                        # second pass: accept the very same cells
        record_feedback("ds1", "outlier", f"b{k}", accepted=True, column="amount", row_index=k)
    state = get_adaptive_state()
    assert after_first < before                # first batch was trusted
    assert state["contamination"] == after_first   # second batch was held, not applied
    assert state["held_batches"] == 1 and state["total_reversals"] == 5


def test_consistent_repeat_decisions_are_not_held(clean_adaptive_state):
    for k in range(5):
        record_feedback("ds1", "outlier", f"a{k}", accepted=False, column="amount", row_index=k)
    for k in range(5):
        record_feedback("ds1", "outlier", f"b{k}", accepted=False, column="amount", row_index=k)
    assert get_adaptive_state()["held_batches"] == 0


def test_config_changes_are_validated_and_applied(clean_adaptive_state):
    s = update_config({"step": 0.01, "batch_size": 3})
    assert s["step"] == 0.01 and s["batch_size"] == 3
    for bad in ({"step": 0.5}, {"batch_size": 0}, {"decay": 0.1}, {"nonsense": 1},
                {"accept_threshold": 0.4, "reject_threshold": 0.45}, {"min": 0.2, "max": 0.1}):
        try:
            update_config(bad)
            assert False, f"{bad} should have been rejected"
        except ValueError:
            pass
    assert get_adaptive_state()["step"] == 0.01       # failed updates changed nothing


# ---------------------------------------------------------------------------
# Pattern, range, user-rule and temporal checks
# ---------------------------------------------------------------------------
from app.services.rules import detect_rule_violations
from app.services.temporal import detect_temporal_anomalies


def test_pattern_check_flags_bad_email_in_email_column():
    emails = [f"user{i}@mail.com" for i in range(20)] + ["not-an-email"]
    issues = detect_rule_violations(pd.DataFrame({"contact": emails}))
    assert [i["original_value"] for i in issues] == ["not-an-email"]
    assert issues[0]["issue_type"] == "pattern_violation"


def test_pattern_check_flags_bad_phone_and_ignores_normal_text():
    phones = [f"98765{i:05d}" for i in range(15)] + ["12ab"]
    issues = detect_rule_violations(pd.DataFrame({"phone": phones}))
    assert [i["original_value"] for i in issues] == ["12ab"]
    names = pd.DataFrame({"name": [f"person {i}" for i in range(30)]})
    assert detect_rule_violations(names) == []


def test_builtin_range_rules_for_age_and_amounts():
    df = pd.DataFrame({"age": [25, 31, -4, 200, 40], "price": [10.0, 12.5, -3.0, 9.0, 8.0], "amount": [5.0, -2.0, 3.0, 4.0, 1.0]})
    got = {(i["column"], i["row_index"]) for i in detect_rule_violations(df)}
    assert got == {("age", 2), ("age", 3), ("price", 2)}   # a negative "amount" may be a refund: not flagged


def test_user_defined_rules_min_max_allowed_and_regex():
    df = pd.DataFrame({"score": [5, 50, 105], "tier": ["gold", "silver", "bronze"], "code": ["A-1", "B-2", "xx"]})
    rules = [
        {"column": "score", "min": 0, "max": 100, "name": "score rule"},
        {"column": "tier", "allowed": ["gold", "silver"]},
        {"column": "code", "regex": r"[A-Z]-\d"},
    ]
    got = {(i["column"], i["row_index"], i["issue_type"]) for i in detect_rule_violations(df, rules)}
    assert got == {("score", 2, "range_violation"), ("tier", 2, "range_violation"), ("code", 2, "pattern_violation")}


def test_temporal_spike_is_found_in_time_ordered_data():
    n = 60
    dates = pd.date_range("2024-01-01", periods=n).strftime("%Y-%m-%d")
    sales = np.linspace(100, 160, n) + np.random.default_rng(1).normal(0, 2, n)
    sales[30] = 600
    issues = detect_temporal_anomalies(pd.DataFrame({"day": dates, "sales": sales}))
    assert [i["row_index"] for i in issues] == [30]


def test_temporal_check_skips_unordered_or_short_data():
    n = 60
    dates = list(pd.date_range("2024-01-01", periods=n).strftime("%Y-%m-%d"))[::-1]
    df = pd.DataFrame({"day": dates, "sales": np.arange(n, dtype=float)})
    assert detect_temporal_anomalies(df) == []
    assert detect_temporal_anomalies(df.head(10)) == []


def test_rare_category_typo_is_flagged_even_when_it_repeats_a_few_times():
    vals = ["Delivered"] * 400 + ["Pending"] * 150 + ["Cancelled"] * 40 + ["Delivred"] * 5 + ["Cancled"] * 5
    df = pd.DataFrame({"status": vals})
    issues = [i for i in detect_categorical_and_date_anomalies(df) if i["issue_type"] == "rare_category"]
    assert len(issues) == 10
    assert {i["suggested_value"] for i in issues} == {"Delivered", "Cancelled"}


def test_small_genuine_category_without_close_match_is_not_flagged_when_it_repeats():
    vals = ["Delivered"] * 400 + ["Pending"] * 150 + ["Refund"] * 5
    df = pd.DataFrame({"status": vals})
    assert [i for i in detect_categorical_and_date_anomalies(df) if i["issue_type"] == "rare_category"] == []
