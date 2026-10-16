"""
Central configuration for the application.
All values are overridable via environment variables (see .env.example).
"""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv is optional at import time; env vars can still be
    # supplied directly by the shell / container.
    pass

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings:
    # --- App ---
    APP_NAME: str = "Explainable AI Data Cleaning Platform"
    ENV: str = os.getenv("ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

    # --- CORS ---
    ALLOWED_ORIGINS: list = os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")

    # --- MongoDB ---
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "edaic_db")
    # If true, uses an in-memory mongomock instance instead of a real
    # MongoDB server. Extremely useful for local demos / grading without
    # having to install MongoDB, and for automated tests.
    USE_MOCK_DB: bool = os.getenv("USE_MOCK_DB", "false").lower() == "true"

    # --- File storage ---
    UPLOAD_DIR: Path = BASE_DIR / "storage" / "uploads"
    CLEANED_DIR: Path = BASE_DIR / "storage" / "cleaned"
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
    ALLOWED_EXTENSIONS: set = {".csv", ".xlsx", ".xls"}

    # --- ML pipeline ---
    OUTLIER_CONTAMINATION: float = float(os.getenv("OUTLIER_CONTAMINATION", "0.05"))
    RANDOM_STATE: int = int(os.getenv("RANDOM_STATE", "42"))

    def __init__(self):
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        self.CLEANED_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()
