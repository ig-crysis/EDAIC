from collections import Counter
from fastapi import APIRouter, HTTPException

from app.database import datasets_collection

router = APIRouter(prefix="/api/datasets", tags=["dashboard"])


@router.get("/{dataset_id}/dashboard")
def dashboard(dataset_id: str):
    """
    Aggregated numbers the frontend charts consume: issue counts by type,
    issue counts by column, and severity distribution.
    """
    doc = datasets_collection.find_one({"dataset_id": dataset_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if "last_analysis" not in doc:
        raise HTTPException(status_code=400, detail="Run /analyze first")

    issues = doc["last_analysis"]["issues"]

    by_type = Counter(i["issue_type"] for i in issues)
    by_severity = Counter(i["severity"] for i in issues)
    by_column = Counter(i["column"] for i in issues if i.get("column"))

    return {
        "dataset_id": dataset_id,
        "quality_score": doc["last_analysis"]["quality_score"],
        "total_issues": len(issues),
        "issues_by_type": dict(by_type),
        "issues_by_severity": dict(by_severity),
        "issues_by_column": dict(by_column.most_common(15)),
    }
