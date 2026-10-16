import math
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.database import datasets_collection
from app.utils.file_handling import load_saved_dataset
from app.api.routes.analyze import _find_upload_path

router = APIRouter(prefix="/api/datasets", tags=["preview"])


def _safe_records(df, start: int, n_rows: int) -> list[dict]:
    """Converts a dataframe slice to plain JSON-safe records — pandas/NumPy
    NaN and int64/float64 types don't serialize cleanly on their own."""
    preview_df = df.iloc[start:start + n_rows]
    records = []
    for idx, row in preview_df.iterrows():
        record = {"_row_index": int(idx)}
        for col, val in row.items():
            if val is None or (isinstance(val, float) and math.isnan(val)):
                record[col] = None
            elif hasattr(val, "item"):  # numpy scalar (int64, float64, bool_...)
                record[col] = val.item()
            else:
                record[col] = val
        records.append(record)
    return records


@router.get("/{dataset_id}/preview")
def preview(dataset_id: str, rows: int = 10, cleaned: bool = False, start: int = 0):
    doc = datasets_collection.find_one({"dataset_id": dataset_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")

    rows = max(1, min(rows, 50))  # sane bounds — this is a preview, not an export
    start = max(0, start)

    if cleaned:
        path = settings.CLEANED_DIR / f"{dataset_id}_cleaned.csv"
        if not path.exists():
            raise HTTPException(status_code=404, detail="No cleaned file yet — run /clean first")
        df = load_saved_dataset(path)
    else:
        path = _find_upload_path(dataset_id)
        df = load_saved_dataset(path)

    total_rows = int(df.shape[0])
    # Clamp so a search for a row past the end doesn't return an empty page —
    # instead lands on the last available page of rows.
    if start >= total_rows and total_rows > 0:
        start = max(0, total_rows - rows)

    return {
        "dataset_id": dataset_id,
        "columns": list(df.columns),
        "rows": _safe_records(df, start, rows),
        "total_rows": total_rows,
        "start": start,
        "showing": min(rows, max(0, total_rows - start)),
    }
