from pathlib import Path
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.database import datasets_collection
from app.utils.file_handling import load_saved_dataset
from app.services.cleaning import analyze_dataset
from app.models.schemas import AnalyzeResponse, ColumnProfile

router = APIRouter(prefix="/api/datasets", tags=["analysis"])


def _find_upload_path(dataset_id: str) -> Path:
    for ext in settings.ALLOWED_EXTENSIONS:
        p = settings.UPLOAD_DIR / f"{dataset_id}{ext}"
        if p.exists():
            return p
    raise HTTPException(status_code=404, detail="Uploaded file not found on disk")


@router.post("/{dataset_id}/analyze", response_model=AnalyzeResponse)
def analyze(dataset_id: str):
    doc = datasets_collection.find_one({"dataset_id": dataset_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")

    path = _find_upload_path(dataset_id)
    df = load_saved_dataset(path)

    result = analyze_dataset(df, rules=doc.get("rules"))

    columns = []
    for col in df.columns:
        columns.append(ColumnProfile(
            name=col,
            dtype=str(df[col].dtype),
            missing_count=int(df[col].isna().sum()),
            missing_pct=round(float(df[col].isna().mean()) * 100, 2),
            unique_count=int(df[col].nunique(dropna=True)),
        ))

    datasets_collection.update_one(
        {"dataset_id": dataset_id},
        {"$set": {
            "status": "analyzed",
            "last_analysis": {
                "issues": result["issues"],
                "quality_score": result["quality_score"],
            },
        }},
    )

    return {
        "dataset_id": dataset_id,
        "n_rows": int(df.shape[0]),
        "n_columns": int(df.shape[1]),
        "columns": columns,
        "issues": result["issues"],
        "quality_score": result["quality_score"],
    }
