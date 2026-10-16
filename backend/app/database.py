"""
Database access layer.

Uses PyMongo (synchronous) for simplicity and predictability inside a
FastAPI app that also does CPU-bound ML work. If USE_MOCK_DB=true, an
in-memory mongomock client is used instead — this lets the whole
application (and the test suite) run without a real MongoDB server,
which is handy for demos and grading.
"""
from datetime import datetime, timezone
from app.config import settings


def _get_client():
    if settings.USE_MOCK_DB:
        import mongomock
        return mongomock.MongoClient()
    from pymongo import MongoClient
    return MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)


_client = _get_client()
db = _client[settings.MONGO_DB_NAME]

datasets_collection = db["datasets"]
cleaning_runs_collection = db["cleaning_runs"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def check_connection() -> bool:
    """Used by the /health endpoint to confirm DB reachability."""
    try:
        _client.admin.command("ping")
        return True
    except Exception:
        # mongomock doesn't implement admin.command("ping") the same way
        # in all versions; fall back to a trivial op.
        try:
            db.list_collection_names()
            return True
        except Exception:
            return False
