"""Engagement schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.base import EngagementStatus


class EngagementCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    scope_config: dict = Field(default_factory=dict)
    rules_of_engagement: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class EngagementUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    scope_config: Optional[dict] = None
    rules_of_engagement: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class EngagementResponse(BaseModel):
    id: uuid.UUID
    name: str
    status: EngagementStatus
    scope_config: dict
    rules_of_engagement: Optional[str]
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EngagementListResponse(BaseModel):
    items: list[EngagementResponse]
    total: int
