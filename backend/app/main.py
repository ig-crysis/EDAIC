from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import check_connection
from app.api.routes import upload, analyze, clean, download, dashboard, preview, adaptive, rules


def _warm_up_ml_pipeline():
    """
    Pre-loads scikit-learn and SHAP and runs one throwaway analysis the
    moment the server starts, instead of on the user's first real upload.
    This means the "cold start" slowness (loading large ML libraries into
    memory for the first time) happens once, in the background, before
    anyone is waiting on it — rather than during someone's actual first
    upload.
    """
    import time
    import numpy as np
    import pandas as pd
    from app.services.cleaning import analyze_dataset

    start = time.time()
    try:
        dummy_df = pd.DataFrame({
            "a": np.random.normal(0, 1, 30),
            "b": np.random.normal(0, 1, 30),
        })
        analyze_dataset(dummy_df)
        print(f"[startup] ML pipeline warmed up in {time.time() - start:.1f}s")
    except Exception as e:
        # Warm-up is a best-effort optimization — if it fails for any
        # reason, the app still works, just with a slower first request.
        print(f"[startup] warm-up skipped due to error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _warm_up_ml_pipeline()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered data cleaning with explainable, auditable decisions.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Catch-all so the API never leaks a raw traceback to the frontend.
    # This handler runs outside CORSMiddleware, so without these headers the
    # browser hides the real message and just shows "Network Error".
    headers = {}
    origin = request.headers.get("origin")
    if origin and origin in settings.ALLOWED_ORIGINS:
        headers = {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
            "vary": "Origin",
        }
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
        headers=headers,
    )


app.include_router(upload.router)
app.include_router(analyze.router)
app.include_router(clean.router)
app.include_router(download.router)
app.include_router(dashboard.router)
app.include_router(preview.router)
app.include_router(adaptive.router)
app.include_router(rules.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "env": settings.ENV,
        "db_connected": check_connection(),
    }


@app.get("/")
def root():
    return {"message": f"{settings.APP_NAME} API. See /docs for interactive API documentation."}
