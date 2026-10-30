"""Operation model."""

import uuid
from typing import Optional

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    Base,
    OperationStatus,
    TimestampMixin,
    ToolDomain,
    UUIDPrimaryKeyMixin,
)


class Operation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "operations"

    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("engagements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tool_domain: Mapped[ToolDomain] = mapped_column(
        Enum(ToolDomain, name="tool_domain"),
        nullable=False,
    )
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    target: Mapped[str] = mapped_column(String(500), nullable=False)
    parameters: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[OperationStatus] = mapped_column(
        Enum(OperationStatus, name="operation_status"),
        nullable=False,
        default=OperationStatus.PLANNED,
    )
    output: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    parent_operation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("operations.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    engagement: Mapped["Engagement"] = relationship("Engagement", back_populates="operations")
    parent_operation: Mapped[Optional["Operation"]] = relationship(
        "Operation",
        remote_side="Operation.id",
        back_populates="child_operations",
    )
    child_operations: Mapped[list["Operation"]] = relationship(
        "Operation",
        back_populates="parent_operation",
    )
    approval_request: Mapped[Optional["ApprovalRequest"]] = relationship(
        "ApprovalRequest",
        back_populates="operation",
        uselist=False,
        cascade="all, delete-orphan",
    )
    findings: Mapped[list["Finding"]] = relationship(
        "Finding", back_populates="operation"
    )

    def __repr__(self) -> str:
        return f"<Operation {self.action_type} on {self.target} [{self.status.value}]>"
