"""Approval engine — classifies tiers, creates/processes approval requests."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.guardrails.action_logger import ActionLogger
from app.models.approval import ApprovalRequest
from app.models.base import (
    ApprovalStatus,
    ApprovalTier,
    AuditAction,
    OperationStatus,
)
from app.models.operation import Operation

# ── Tier classification rules ────────────────────────────────────────

PASSIVE_ACTIONS: set[str] = {
    "port_scan",
    "dns_enum",
    "whois",
    "bloodhound_collection",
    "cloud_audit",
    "config_review",
}

ACTIVE_ACTIONS: set[str] = {
    "vuln_scan",
    "credential_spray",
    "brute_force",
    "service_enum",
    "cloud_enum",
}

EXPLOIT_ACTIONS: set[str] = {
    "exploit",
    "privilege_escalation",
    "credential_dump",
    "token_theft",
}

LATERAL_ACTIONS: set[str] = {
    "lateral_movement",
    "pivot",
    "persistence",
    "c2_setup",
    "data_exfiltration",
}


class ApprovalEngine:
    """Manages the tiered approval workflow for red-team operations."""

    # ── Tier classification ───────────────────────────────────────────

    @staticmethod
    def classify_tier(operation: Operation) -> ApprovalTier:
        """Determine which approval tier an operation requires."""
        action = operation.action_type.lower()
        if action in LATERAL_ACTIONS:
            return ApprovalTier.LATERAL
        if action in EXPLOIT_ACTIONS:
            return ApprovalTier.EXPLOIT
        if action in ACTIVE_ACTIONS:
            return ApprovalTier.ACTIVE
        if action in PASSIVE_ACTIONS:
            return ApprovalTier.PASSIVE
        # Default to ACTIVE for unknown action types — safe middle ground
        return ApprovalTier.ACTIVE

    # ── Approval request lifecycle ────────────────────────────────────

    @classmethod
    async def create_approval_request(
        cls,
        db: AsyncSession,
        operation: Operation,
        actor_id: Optional[uuid.UUID] = None,
    ) -> ApprovalRequest:
        """Create an approval request for an operation and transition it to PENDING_APPROVAL."""
        tier = cls.classify_tier(operation)

        # Calculate auto-approve deadline for PASSIVE tier
        auto_approve_at: Optional[datetime] = None
        if tier == ApprovalTier.PASSIVE:
            auto_approve_at = datetime.now(timezone.utc) + timedelta(
                seconds=settings.TIER0_AUTO_APPROVE_SECONDS
            )

        approval = ApprovalRequest(
            operation_id=operation.id,
            tier=tier,
            status=ApprovalStatus.PENDING,
            auto_approve_at=auto_approve_at,
        )
        db.add(approval)

        operation.status = OperationStatus.PENDING_APPROVAL
        await db.flush()

        await ActionLogger.log(
            db,
            actor_id=actor_id,
            action=AuditAction.APPROVAL_REQUESTED,
            resource_type="approval_request",
            resource_id=approval.id,
            details={
                "operation_id": str(operation.id),
                "tier": tier.name,
                "auto_approve_at": auto_approve_at.isoformat() if auto_approve_at else None,
            },
        )

        return approval

    @staticmethod
    async def check_auto_approve(db: AsyncSession) -> list[ApprovalRequest]:
        """Find and auto-approve PASSIVE requests whose timeout has elapsed."""
        now = datetime.now(timezone.utc)
        stmt = (
            select(ApprovalRequest)
            .where(
                ApprovalRequest.status == ApprovalStatus.PENDING,
                ApprovalRequest.tier == ApprovalTier.PASSIVE,
                ApprovalRequest.auto_approve_at <= now,
            )
        )
        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        for req in requests:
            req.status = ApprovalStatus.AUTO_APPROVED
            req.decided_at = now
            req.decision_notes = "Auto-approved: PASSIVE tier timeout elapsed"

            # Also transition the operation
            operation = await db.get(Operation, req.operation_id)
            if operation is not None:
                operation.status = OperationStatus.APPROVED

            await ActionLogger.log(
                db,
                actor_id=None,
                action=AuditAction.APPROVAL_AUTO_APPROVED,
                resource_type="approval_request",
                resource_id=req.id,
                details={"operation_id": str(req.operation_id)},
            )

        await db.flush()
        return requests

    @staticmethod
    async def process_decision(
        db: AsyncSession,
        request_id: uuid.UUID,
        approved: bool,
        reviewer_id: uuid.UUID,
        notes: Optional[str] = None,
    ) -> ApprovalRequest:
        """Process a human approval/denial decision."""
        approval = await db.get(ApprovalRequest, request_id)
        if approval is None:
            raise ValueError(f"Approval request {request_id} not found")

        if approval.status != ApprovalStatus.PENDING:
            raise ValueError(
                f"Approval request {request_id} is already {approval.status.value}"
            )

        now = datetime.now(timezone.utc)
        approval.status = ApprovalStatus.APPROVED if approved else ApprovalStatus.DENIED
        approval.reviewer_id = reviewer_id
        approval.decision_notes = notes
        approval.decided_at = now

        # Transition the operation
        operation = await db.get(Operation, approval.operation_id)
        if operation is not None:
            operation.status = (
                OperationStatus.APPROVED if approved else OperationStatus.CANCELLED
            )

        audit_action = AuditAction.APPROVAL_GRANTED if approved else AuditAction.APPROVAL_DENIED
        await ActionLogger.log(
            db,
            actor_id=reviewer_id,
            action=audit_action,
            resource_type="approval_request",
            resource_id=approval.id,
            details={
                "operation_id": str(approval.operation_id),
                "decision": "approved" if approved else "denied",
                "notes": notes,
            },
        )

        await db.flush()
        return approval
