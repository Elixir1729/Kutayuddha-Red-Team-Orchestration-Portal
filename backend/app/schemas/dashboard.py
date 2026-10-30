"""Dashboard schemas."""

import uuid
from typing import Optional

from pydantic import BaseModel

from app.models.base import EngagementStatus, FindingSeverity


class OperationCounts(BaseModel):
    planned: int = 0
    pending_approval: int = 0
    approved: int = 0
    executing: int = 0
    completed: int = 0
    failed: int = 0
    cancelled: int = 0
    blocked: int = 0


class EngagementSummary(BaseModel):
    id: uuid.UUID
    name: str
    status: EngagementStatus
    operation_count: int
    finding_count: int
    pending_approvals: int


class DashboardStats(BaseModel):
    total_engagements: int
    active_engagements: int
    total_operations: int
    total_findings: int
    findings_by_severity: dict[FindingSeverity, int]
    operation_counts: OperationCounts
    recent_engagements: list[EngagementSummary]
    kill_switches_active: list[str]
