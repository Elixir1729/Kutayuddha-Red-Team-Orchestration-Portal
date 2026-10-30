"""Action logger — writes immutable audit log entries. No updates allowed."""

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.base import AuditAction


class ActionLogger:
    """Writes immutable audit log entries to the database."""

    @staticmethod
    async def log(
        db: AsyncSession,
        *,
        actor_id: Optional[uuid.UUID],
        action: AuditAction,
        resource_type: str,
        resource_id: Optional[uuid.UUID] = None,
        details: Optional[dict] = None,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        """Create an immutable audit log entry.

        This method only inserts; it never updates existing records.
        """
        entry = AuditLog(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
        )
        db.add(entry)
        await db.flush()
        return entry
