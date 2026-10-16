"""
Exposes the adaptive feedback loop's state: current outlier-detection
sensitivity, how many reviewer decisions have fed into it, and a small
history of past adjustments (with the reasoning behind each one) — plus a
reset endpoint.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.adaptive import get_adaptive_state, reset_adaptive_state, update_config, _recent_accept_rate

router = APIRouter(prefix="/api/adaptive", tags=["adaptive"])


def _serialize(state: dict) -> dict:
    total = state["accepted_outlier_decisions"] + state["rejected_outlier_decisions"]
    return {
        "contamination": state["contamination"],
        "default_contamination": state["default_contamination"],
        "min": state["min"],
        "max": state["max"],
        "step": state["step"],
        "batch_size": state["batch_size"],
        "total_outlier_decisions": state["total_outlier_decisions"],
        "accepted_outlier_decisions": state["accepted_outlier_decisions"],
        "rejected_outlier_decisions": state["rejected_outlier_decisions"],
        "decisions_since_last_adjustment": state["decisions_since_last_adjustment"],
        "accept_rate": round(state["accepted_outlier_decisions"] / total, 2) if total else None,
        "recent_accept_rate": round(_recent_accept_rate(state), 2) if total else None,
        "accept_threshold": state["accept_threshold"],
        "reject_threshold": state["reject_threshold"],
        "decay": state["decay"],
        "total_reversals": state["total_reversals"],
        "held_batches": state["held_batches"],
        "history": state["history"],
        "updated_at": state["updated_at"],
    }


@router.get("/state")
def get_state():
    return _serialize(get_adaptive_state())


@router.post("/reset")
def reset_state():
    return _serialize(reset_adaptive_state())


class AdaptiveConfig(BaseModel):
    step: Optional[float] = None
    batch_size: Optional[int] = None
    decay: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    accept_threshold: Optional[float] = None
    reject_threshold: Optional[float] = None


@router.post("/config")
def set_config(config: AdaptiveConfig):
    try:
        return _serialize(update_config(config.model_dump()))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
