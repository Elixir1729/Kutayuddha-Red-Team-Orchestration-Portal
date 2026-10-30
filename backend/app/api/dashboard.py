"""Dashboard endpoints — aggregated stats and live status."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.guardrails.kill_switch import kill_switch
from app.models.approval import ApprovalRequest
from app.models.base import (
    ApprovalStatus,
    EngagementStatus,
    FindingSeverity,
    OperationStatus,
)
from app.models.engagement import Engagement
from app.models.finding import Finding
from app.models.operation import Operation
from app.schemas.dashboard import DashboardStats, EngagementSummary, OperationCounts
from app.services.report_generator import ReportGenerator

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_stats(db: AsyncSession = Depends(get_db)) -> DashboardStats:
    """Return aggregated dashboard statistics."""
    # Engagement counts
    total_eng = (await db.execute(select(func.count(Engagement.id)))).scalar_one()
    active_eng = (
        await db.execute(
            select(func.count(Engagement.id)).where(
                Engagement.status == EngagementStatus.ACTIVE
            )
        )
    ).scalar_one()

    # Operation counts by status
    op_counts_raw = (
        await db.execute(
            select(Operation.status, func.count(Operation.id)).group_by(Operation.status)
        )
    ).all()
    op_map = {row[0].value: row[1] for row in op_counts_raw}
    operation_counts = OperationCounts(
        planned=op_map.get("PLANNED", 0),
        pending_approval=op_map.get("PENDING_APPROVAL", 0),
        approved=op_map.get("APPROVED", 0),
        executing=op_map.get("EXECUTING", 0),
        completed=op_map.get("COMPLETED", 0),
        failed=op_map.get("FAILED", 0),
        cancelled=op_map.get("CANCELLED", 0),
        blocked=op_map.get("BLOCKED", 0),
    )
    total_ops = sum(
        [
            operation_counts.planned,
            operation_counts.pending_approval,
            operation_counts.approved,
            operation_counts.executing,
            operation_counts.completed,
            operation_counts.failed,
            operation_counts.cancelled,
            operation_counts.blocked,
        ]
    )

    # Finding counts by severity
    severity_raw = (
        await db.execute(
            select(Finding.severity, func.count(Finding.id)).group_by(Finding.severity)
        )
    ).all()
    findings_by_severity = {sev: 0 for sev in FindingSeverity}
    for row in severity_raw:
        findings_by_severity[row[0]] = row[1]
    total_findings = sum(findings_by_severity.values())

    # Recent engagements with summary stats
    recent_eng_result = await db.execute(
        select(Engagement).order_by(Engagement.updated_at.desc()).limit(10)
    )
    recent_engagements: list[EngagementSummary] = []
    for eng in recent_eng_result.scalars().all():
        op_count = (
            await db.execute(
                select(func.count(Operation.id)).where(Operation.engagement_id == eng.id)
            )
        ).scalar_one()
        finding_count = (
            await db.execute(
                select(func.count(Finding.id)).where(Finding.engagement_id == eng.id)
            )
        ).scalar_one()
        pending_approvals = (
            await db.execute(
                select(func.count(ApprovalRequest.id))
                .join(Operation, Operation.id == ApprovalRequest.operation_id)
                .where(
                    Operation.engagement_id == eng.id,
                    ApprovalRequest.status == ApprovalStatus.PENDING,
                )
            )
        ).scalar_one()
        recent_engagements.append(
            EngagementSummary(
                id=eng.id,
                name=eng.name,
                status=eng.status,
                operation_count=op_count,
                finding_count=finding_count,
                pending_approvals=pending_approvals,
            )
        )

    # Kill switches
    active_switches = await kill_switch.list_active()

    return DashboardStats(
        total_engagements=total_eng,
        active_engagements=active_eng,
        total_operations=total_ops,
        total_findings=total_findings,
        findings_by_severity=findings_by_severity,
        operation_counts=operation_counts,
        recent_engagements=recent_engagements,
        kill_switches_active=active_switches,
    )


@router.get("/live-status")
async def live_status(db: AsyncSession = Depends(get_db)) -> dict:
    """Lightweight live status for polling / WebSocket fallback."""
    executing = (
        await db.execute(
            select(func.count(Operation.id)).where(
                Operation.status == OperationStatus.EXECUTING
            )
        )
    ).scalar_one()
    pending = (
        await db.execute(
            select(func.count(ApprovalRequest.id)).where(
                ApprovalRequest.status == ApprovalStatus.PENDING
            )
        )
    ).scalar_one()
    active_switches = await kill_switch.list_active()

    return {
        "executing_operations": executing,
        "pending_approvals": pending,
        "kill_switches_active": active_switches,
    }


@router.get("/report/{engagement_id}")
async def get_report(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a full engagement report."""
    try:
        report = await ReportGenerator.generate_report(db, engagement_id)
    except ValueError as exc:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail=str(exc))
    return report
