"""Approval schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.base import ApprovalStatus, ApprovalTier


class ApprovalResponse(BaseModel):
    id: uuid.UUID
    operation_id: uuid.UUID
    tier: ApprovalTier
    status: ApprovalStatus
    reviewer_id: Optional[uuid.UUID]
    decision_notes: Optional[str]
    decided_at: Optional[datetime]
    auto_approve_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApprovalDecisionRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=2000)


class BulkApprovalRequest(BaseModel):
    approval_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=50)
    notes: Optional[str] = Field(None, max_length=2000)
