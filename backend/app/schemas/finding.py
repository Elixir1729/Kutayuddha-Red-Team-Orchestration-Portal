"""Finding schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.base import FindingSeverity


class FindingCreate(BaseModel):
    engagement_id: uuid.UUID
    operation_id: Optional[uuid.UUID] = None
    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1)
    severity: FindingSeverity
    evidence: Optional[dict] = None
    cvss_score: Optional[float] = Field(None, ge=0.0, le=10.0)
    affected_asset: Optional[str] = Field(None, max_length=500)


class FindingUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, min_length=1)
    severity: Optional[FindingSeverity] = None
    evidence: Optional[dict] = None
    cvss_score: Optional[float] = Field(None, ge=0.0, le=10.0)
    affected_asset: Optional[str] = Field(None, max_length=500)


class FindingResponse(BaseModel):
    id: uuid.UUID
    engagement_id: uuid.UUID
    operation_id: Optional[uuid.UUID]
    title: str
    description: str
    severity: FindingSeverity
    evidence: Optional[dict]
    cvss_score: Optional[float]
    affected_asset: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FindingListResponse(BaseModel):
    items: list[FindingResponse]
    total: int
