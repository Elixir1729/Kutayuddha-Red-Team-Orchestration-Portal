"""Engagement model."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, String, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, EngagementStatus, TimestampMixin, UUIDPrimaryKeyMixin


class Engagement(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "engagements"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[EngagementStatus] = mapped_column(
        Enum(EngagementStatus, name="engagement_status"),
        nullable=False,
        default=EngagementStatus.DRAFT,
    )
    scope_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    rules_of_engagement: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    operations: Mapped[list["Operation"]] = relationship(
        "Operation", back_populates="engagement", cascade="all, delete-orphan"
    )
    findings: Mapped[list["Finding"]] = relationship(
        "Finding", back_populates="engagement", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Engagement {self.name} status={self.status.value}>"
