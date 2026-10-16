import uuid
from fastapi import APIRouter, HTTPException

from app.database import datasets_collection, cleaning_runs_collection, now_iso
from app.utils.file_handling import load_saved_dataset, save_cleaned
from app.services.cleaning import apply_cleaning
from app.services.quality_score import compute_quality_score
from app.services.adaptive import record_feedback
from app.api.routes.analyze import _find_upload_path
from app.models.schemas import ApplyCleaningRequest, ApplyCleaningResponse

router = APIRouter(prefix="/api/datasets", tags=["cleaning"])


@router.post("/{dataset_id}/clean", response_model=ApplyCleaningResponse)
def clean(dataset_id: str, request: ApplyCleaningRequest):
    doc = datasets_collection.find_one({"dataset_id": dataset_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if "last_analysis" not in doc:
        raise HTTPException(status_code=400, detail="Run /analyze before /clean")

    path = _find_upload_path(dataset_id)
    df = load_saved_dataset(path)
    issues = doc["last_analysis"]["issues"]
    before_score = doc["last_analysis"]["quality_score"]

    cleaned_df, n_applied = apply_cleaning(
        df, issues,
        accepted_issue_ids=request.accepted_issue_ids,
        rejected_issue_ids=request.rejected_issue_ids,
    )

    # Log every explicit accept/reject decision as feedback. This is what
    # lets the adaptive loop (app.services.adaptive) actually learn from
    # reviewer behavior instead of just recording it: outlier decisions
    # here nudge the detector's sensitivity for future analyses.
    accepted_ids = set(request.accepted_issue_ids) if request.accepted_issue_ids is not None else None
    rejected_ids = set(request.rejected_issue_ids or [])
    for issue in issues:
        iid = issue["issue_id"]
        if iid in rejected_ids:
            decided_accepted = False
        elif accepted_ids is None or iid in accepted_ids:
            decided_accepted = True
        else:
            continue  # no explicit decision was made on this issue
        record_feedback(dataset_id, issue["issue_type"], iid, decided_accepted,
                        column=issue.get("column"), row_index=issue.get("row_index"))

    # Re-run detectors on the cleaned data for an honest "after" score
    from app.services.cleaning import analyze_dataset
    after_result = analyze_dataset(cleaned_df, rules=doc.get("rules"))
    after_score = after_result["quality_score"]

    save_cleaned(dataset_id, cleaned_df)

    cleaning_run_id = str(uuid.uuid4())
    cleaning_runs_collection.insert_one({
        "cleaning_run_id": cleaning_run_id,
        "dataset_id": dataset_id,
        "created_at": now_iso(),
        "n_changes_applied": n_applied,
        "before_score": before_score,
        "after_score": after_score,
    })

    datasets_collection.update_one(
        {"dataset_id": dataset_id},
        {"$set": {"status": "cleaned"}},
    )

    return {
        "dataset_id": dataset_id,
        "cleaning_run_id": cleaning_run_id,
        "n_changes_applied": n_applied,
        "before_score": before_score,
        "after_score": after_score,
        "download_url": f"/api/datasets/{dataset_id}/download",
    }
