"""Guardrail middleware that wraps every operation execution."""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.guardrails.action_logger import ActionLogger
from app.guardrails.kill_switch import kill_switch
from app.guardrails.scope_enforcer import ScopeEnforcer, ScopeViolation
from app.models.base import AuditAction, OperationStatus
from app.models.engagement import Engagement
from app.models.operation import Operation

logger = logging.getLogger(__name__)


class KillSwitchActive(Exception):
    """Raised when the kill switch is active for the engagement."""

    def __init__(self, engagement_id: uuid.UUID) -> None:
        self.engagement_id = engagement_id
        super().__init__(f"Kill switch is active for engagement {engagement_id}")


class GuardrailMiddleware:
    """Wraps every operation execution to enforce safety guardrails.

    Checks executed in order:
    1. Kill switch — is the engagement halted?
    2. Scope validation — does the target fall within scope?
    3. Pre-execution audit log entry
    4. (caller executes the operation)
    5. Post-execution audit log entry
    """

    @staticmethod
    async def pre_execute(
        db: AsyncSession,
        operation: Operation,
        actor_id: uuid.UUID | None = None,
    ) -> None:
        """Run all pre-execution guardrail checks.

        Raises ``KillSwitchActive`` or ``ScopeViolation`` on failure.
        """
        # 1. Kill switch
        if await kill_switch.is_active(operation.engagement_id):
            operation.status = OperationStatus.BLOCKED
            await db.flush()
            logger.warning(
                "Operation %s blocked by kill switch (engagement %s)",
                operation.id,
                operation.engagement_id,
            )
            raise KillSwitchActive(operation.engagement_id)

        # 2. Scope validation
        engagement = await db.get(Engagement, operation.engagement_id)
        if engagement is None:
            raise ValueError(f"Engagement {operation.engagement_id} not found")

        try:
            ScopeEnforcer.enforce(operation, engagement)
        except ScopeViolation:
            operation.status = OperationStatus.BLOCKED
            await db.flush()
            await ActionLogger.log(
                db,
                actor_id=actor_id,
                action=AuditAction.OPERATION_FAILED,
                resource_type="operation",
                resource_id=operation.id,
                details={"reason": "scope_violation", "target": operation.target},
            )
            raise

        # 3. Pre-execution audit
        await ActionLogger.log(
            db,
            actor_id=actor_id,
            action=AuditAction.OPERATION_EXECUTED,
            resource_type="operation",
            resource_id=operation.id,
            details={
                "action_type": operation.action_type,
                "target": operation.target,
                "tool_domain": operation.tool_domain.value,
                "phase": "pre_execute",
            },
        )

    @staticmethod
    async def post_execute(
        db: AsyncSession,
        operation: Operation,
        success: bool,
        actor_id: uuid.UUID | None = None,
    ) -> None:
        """Record the outcome of an operation execution."""
        action = AuditAction.OPERATION_EXECUTED if success else AuditAction.OPERATION_FAILED
        await ActionLogger.log(
            db,
            actor_id=actor_id,
            action=action,
            resource_type="operation",
            resource_id=operation.id,
            details={
                "action_type": operation.action_type,
                "target": operation.target,
                "status": operation.status.value,
                "phase": "post_execute",
                "success": success,
            },
        )
