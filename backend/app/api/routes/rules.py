"""
User-defined validation rules for one dataset. Rules are stored with the
dataset and applied on every analysis of it.
"""
import re
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import datasets_collection

router = APIRouter(prefix="/api/datasets", tags=["rules"])


class Rule(BaseModel):
    column: str
    name: Optional[str] = None
    min: Optional[float] = None
    max: Optional[float] = None
    allowed: Optional[list] = None
    regex: Optional[str] = None


class RuleSet(BaseModel):
    rules: list[Rule]


@router.get("/{dataset_id}/rules")
def get_rules(dataset_id: str):
    doc = datasets_collection.find_one({"dataset_id": dataset_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"dataset_id": dataset_id, "rules": doc.get("rules", [])}


@router.put("/{dataset_id}/rules")
def set_rules(dataset_id: str, body: RuleSet):
    doc = datasets_collection.find_one({"dataset_id": dataset_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    for r in body.rules:
        if r.min is None and r.max is None and not r.allowed and not r.regex:
            raise HTTPException(status_code=400, detail=f"Rule for '{r.column}' has no condition")
        if r.min is not None and r.max is not None and r.min > r.max:
            raise HTTPException(status_code=400, detail=f"Rule for '{r.column}': min is above max")
        if r.regex:
            try:
                re.compile(r.regex)
            except re.error as e:
                raise HTTPException(status_code=400, detail=f"Rule for '{r.column}': invalid regex ({e})")
    rules = [r.model_dump(exclude_none=True) for r in body.rules]
    datasets_collection.update_one({"dataset_id": dataset_id}, {"$set": {"rules": rules}})
    return {"dataset_id": dataset_id, "rules": rules}
