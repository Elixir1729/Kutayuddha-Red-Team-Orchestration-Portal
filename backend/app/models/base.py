"""Base model with UUID primary key and timestamps."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all models."""
    pass


class TimestampMixin:
    """Mixin that adds created_at and updated_at columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class UUIDPrimaryKeyMixin:
    """Mixin that adds a UUID primary key."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


# ─── Enums ───────────────────────────────────────────────────────────


class EngagementStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    ABORTED = "ABORTED"


class ToolDomain(str, enum.Enum):
    AD = "AD"
    CLOUD = "CLOUD"
    NETWORK = "NETWORK"
    AI_LLM = "AI_LLM"


class OperationStatus(str, enum.Enum):
    PLANNED = "PLANNED"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    EXECUTING = "EXECUTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    BLOCKED = "BLOCKED"


class ApprovalTier(int, enum.Enum):
    PASSIVE = 0
    ACTIVE = 1
    EXPLOIT = 2
    LATERAL = 3


class ApprovalStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    AUTO_APPROVED = "AUTO_APPROVED"
    EXPIRED = "EXPIRED"


class FindingSeverity(str, enum.Enum):
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class UserRole(str, enum.Enum):
    OPERATOR = "OPERATOR"
    SENIOR_OPERATOR = "SENIOR_OPERATOR"
    LEAD = "LEAD"
    ADMIN = "ADMIN"


class AuditAction(str, enum.Enum):
    ENGAGEMENT_CREATED = "ENGAGEMENT_CREATED"
    ENGAGEMENT_STARTED = "ENGAGEMENT_STARTED"
    ENGAGEMENT_PAUSED = "ENGAGEMENT_PAUSED"
    ENGAGEMENT_COMPLETED = "ENGAGEMENT_COMPLETED"
    ENGAGEMENT_ABORTED = "ENGAGEMENT_ABORTED"
    OPERATION_PLANNED = "OPERATION_PLANNED"
    OPERATION_EXECUTED = "OPERATION_EXECUTED"
    OPERATION_CANCELLED = "OPERATION_CANCELLED"
    OPERATION_FAILED = "OPERATION_FAILED"
    APPROVAL_REQUESTED = "APPROVAL_REQUESTED"
    APPROVAL_GRANTED = "APPROVAL_GRANTED"
    APPROVAL_DENIED = "APPROVAL_DENIED"
    APPROVAL_AUTO_APPROVED = "APPROVAL_AUTO_APPROVED"
    APPROVAL_EXPIRED = "APPROVAL_EXPIRED"
    FINDING_CREATED = "FINDING_CREATED"
    FINDING_UPDATED = "FINDING_UPDATED"
    KILL_SWITCH_ACTIVATED = "KILL_SWITCH_ACTIVATED"
    KILL_SWITCH_DEACTIVATED = "KILL_SWITCH_DEACTIVATED"
    USER_LOGIN = "USER_LOGIN"
    REPORT_GENERATED = "REPORT_GENERATED"
