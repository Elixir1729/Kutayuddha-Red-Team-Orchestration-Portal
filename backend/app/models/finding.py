"""Finding model."""

import uuid
from typing import Optional

from sqlalchemy import Enum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    Base,
    FindingSeverity,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)


class Finding(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "findings"

    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("engagements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    operation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("operations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[FindingSeverity] = mapped_column(
        Enum(FindingSeverity, name="finding_severity"),
        nullable=False,
    )
    evidence: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    cvss_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    affected_asset: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Relationships
    engagement: Mapped["Engagement"] = relationship("Engagement", back_populates="findings")
    operation: Mapped[Optional["Operation"]] = relationship(
        "Operation", back_populates="findings"
    )

    def __repr__(self) -> str:
        return f"<Finding {self.title} severity={self.severity.value}>"
