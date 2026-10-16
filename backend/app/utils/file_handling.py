"""
Helpers for reading uploaded datasets, validating them, and writing
cleaned output files.
"""
import io
from pathlib import Path
import pandas as pd
from fastapi import HTTPException, UploadFile

from app.config import settings


# Placeholders commonly used for "missing" in real datasets (UCI uses "?").
# pandas only treats a fixed default set as NaN, so we add the rest.
EXTRA_NA_VALUES = ["?", "na", "n/a", "N/A", "NA", "null", "NULL", "none", "None", "-", "--", "nan", "NaN"]


def _read_csv_any_encoding(source) -> pd.DataFrame:
    """CSVs saved from Excel on Windows are often cp1252, not UTF-8.
    Try UTF-8 first (with BOM handling), then fall back."""
    last_err = None
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            if hasattr(source, "seek"):
                source.seek(0)
            return pd.read_csv(source, encoding=enc, na_values=EXTRA_NA_VALUES, skipinitialspace=True)
        except UnicodeDecodeError as e:
            last_err = e
    raise last_err


def validate_upload(file: UploadFile, content: bytes) -> None:
    ext = Path(file.filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed types: {sorted(settings.ALLOWED_EXTENSIONS)}",
        )

    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({size_mb:.1f}MB). Max allowed is {settings.MAX_UPLOAD_SIZE_MB}MB.",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")


def read_dataset(filename: str, content: bytes) -> pd.DataFrame:
    ext = Path(filename).suffix.lower()
    try:
        if ext == ".csv":
            df = _read_csv_any_encoding(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content), na_values=EXTRA_NA_VALUES)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")

    if df.empty:
        raise HTTPException(status_code=422, detail="Dataset has no rows.")
    if df.shape[1] == 0:
        raise HTTPException(status_code=422, detail="Dataset has no columns.")

    return df


def save_upload(dataset_id: str, filename: str, content: bytes) -> Path:
    ext = Path(filename).suffix.lower()
    path = settings.UPLOAD_DIR / f"{dataset_id}{ext}"
    path.write_bytes(content)
    return path


def save_cleaned(dataset_id: str, df: pd.DataFrame) -> Path:
    path = settings.CLEANED_DIR / f"{dataset_id}_cleaned.csv"
    df.to_csv(path, index=False)
    return path


def load_saved_dataset(path: Path) -> pd.DataFrame:
    ext = path.suffix.lower()
    if ext == ".csv":
        return _read_csv_any_encoding(path)
    return pd.read_excel(path, na_values=EXTRA_NA_VALUES)
