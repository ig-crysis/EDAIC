import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException

from app.database import datasets_collection, now_iso
from app.utils.file_handling import validate_upload, read_dataset, save_upload
from app.models.schemas import DatasetSummary

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.post("/upload", response_model=DatasetSummary)
async def upload_dataset(file: UploadFile = File(...)):
    content = await file.read()
    validate_upload(file, content)
    df = read_dataset(file.filename, content)

    dataset_id = str(uuid.uuid4())
    save_upload(dataset_id, file.filename, content)

    doc = {
        "dataset_id": dataset_id,
        "filename": file.filename,
        "uploaded_at": now_iso(),
        "n_rows": int(df.shape[0]),
        "n_columns": int(df.shape[1]),
        "status": "uploaded",
    }
    datasets_collection.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("", response_model=list[DatasetSummary])
def list_datasets():
    docs = list(datasets_collection.find({}, {"_id": 0}).sort("uploaded_at", -1))
    return docs


@router.get("/{dataset_id}", response_model=DatasetSummary)
def get_dataset(dataset_id: str):
    doc = datasets_collection.find_one({"dataset_id": dataset_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return doc
