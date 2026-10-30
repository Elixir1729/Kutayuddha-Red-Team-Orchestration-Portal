"""Operation schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.base import OperationStatus, ToolDomain


class OperationResponse(BaseModel):
    id: uuid.UUID
    engagement_id: uuid.UUID
    tool_domain: ToolDomain
    action_type: str
    target: str
    parameters: dict
    status: OperationStatus
    output: Optional[dict]
    parent_operation_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OperationListResponse(BaseModel):
    items: list[OperationResponse]
    total: int
