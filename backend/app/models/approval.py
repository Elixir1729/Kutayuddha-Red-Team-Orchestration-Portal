"""Approval request model."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ApprovalStatus,
    ApprovalTier,
    Base,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)


class ApprovalRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "approval_requests"

    operation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("operations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    tier: Mapped[ApprovalTier] = mapped_column(
        Enum(ApprovalTier, name="approval_tier"),
        nullable=False,
    )
    status: Mapped[ApprovalStatus] = mapped_column(
        Enum(ApprovalStatus, name="approval_status"),
        nullable=False,
        default=ApprovalStatus.PENDING,
    )
    reviewer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    decision_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    auto_approve_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    operation: Mapped["Operation"] = relationship(
        "Operation", back_populates="approval_request"
    )
    reviewer: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="approval_reviews",
        foreign_keys=[reviewer_id],
    )

    def __repr__(self) -> str:
        return f"<ApprovalRequest tier={self.tier.name} status={self.status.value}>"
