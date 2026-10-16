from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.database import datasets_collection

router = APIRouter(prefix="/api/datasets", tags=["download"])


@router.get("/{dataset_id}/download")
def download_cleaned(dataset_id: str):
    path = settings.CLEANED_DIR / f"{dataset_id}_cleaned.csv"
    if not path.exists():
        raise HTTPException(status_code=404, detail="No cleaned file yet — run /clean first")

    doc = datasets_collection.find_one({"dataset_id": dataset_id}, {"_id": 0, "filename": 1})
    original_name = doc["filename"].rsplit(".", 1)[0] if doc else dataset_id

    return FileResponse(
        path=path,
        filename=f"{original_name}_cleaned.csv",
        media_type="text/csv",
    )
