"""
Pydantic schemas used across the API layer.
"""
from typing import Any, Optional
from pydantic import BaseModel, Field


class ColumnProfile(BaseModel):
    name: str
    dtype: str
    missing_count: int
    missing_pct: float
    unique_count: int


class Issue(BaseModel):
    """A single detected data-quality issue tied to a row/column."""
    issue_id: str
    issue_type: str          # missing_value | sparse_column | duplicate | outlier | inconsistent_value | rare_category | date_anomaly | pattern_violation | range_violation | temporal_anomaly
    column: Optional[str] = None
    row_index: Optional[int] = None
    row_indices: Optional[list] = None   # for duplicate groups
    severity: str             # low | medium | high
    original_value: Optional[Any] = None
    suggested_value: Optional[Any] = None
    explanation: str
    detected_by: str          # e.g. "Local Outlier Factor + SHAP", "rule-based regex"
    confidence: float


class QualityScoreBreakdown(BaseModel):
    completeness: float
    uniqueness: float
    validity: float
    consistency: float
    overall_score: float


class AnalyzeResponse(BaseModel):
    dataset_id: str
    n_rows: int
    n_columns: int
    columns: list[ColumnProfile]
    issues: list[Issue]
    quality_score: QualityScoreBreakdown


class ApplyCleaningRequest(BaseModel):
    dataset_id: str
    accepted_issue_ids: Optional[list[str]] = None   # None = accept all
    rejected_issue_ids: Optional[list[str]] = None


class ApplyCleaningResponse(BaseModel):
    dataset_id: str
    cleaning_run_id: str
    n_changes_applied: int
    before_score: QualityScoreBreakdown
    after_score: QualityScoreBreakdown
    download_url: str


class AdaptiveHistoryEntry(BaseModel):
    at: str
    from_: float = Field(alias="from")
    to: float
    reason: str
    accept_rate: float

    class Config:
        populate_by_name = True


class AdaptiveState(BaseModel):
    contamination: float
    default_contamination: float
    min: float
    max: float
    step: float
    batch_size: int
    total_outlier_decisions: int
    accepted_outlier_decisions: int
    rejected_outlier_decisions: int
    decisions_since_last_adjustment: int
    history: list[AdaptiveHistoryEntry]
    updated_at: str


class DatasetSummary(BaseModel):
    dataset_id: str
    filename: str
    uploaded_at: str
    n_rows: int
    n_columns: int
    status: str
