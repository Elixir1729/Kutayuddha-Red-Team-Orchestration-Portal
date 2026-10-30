"""Audit log schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.base import AuditAction


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    actor_id: Optional[uuid.UUID]
    action: AuditAction
    resource_type: str
    resource_id: Optional[uuid.UUID]
    details: Optional[dict]
    ip_address: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogFilter(BaseModel):
    actor_id: Optional[uuid.UUID] = None
    action: Optional[AuditAction] = None
    resource_type: Optional[str] = None
    resource_id: Optional[uuid.UUID] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
