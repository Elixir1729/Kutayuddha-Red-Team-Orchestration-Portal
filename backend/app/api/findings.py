"""Findings CRUD + export."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.guardrails.action_logger import ActionLogger
from app.models.base import AuditAction, FindingSeverity
from app.models.finding import Finding
from app.schemas.finding import (
    FindingCreate,
    FindingListResponse,
    FindingResponse,
    FindingUpdate,
)

router = APIRouter(prefix="/findings", tags=["findings"])


@router.get("", response_model=FindingListResponse)
async def list_findings(
    engagement_id: uuid.UUID | None = None,
    severity: FindingSeverity | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> FindingListResponse:
    """List findings with optional filters."""
    query = select(Finding)
    count_query = select(func.count(Finding.id))

    if engagement_id is not None:
        query = query.where(Finding.engagement_id == engagement_id)
        count_query = count_query.where(Finding.engagement_id == engagement_id)
    if severity is not None:
        query = query.where(Finding.severity == severity)
        count_query = count_query.where(Finding.severity == severity)

    total = (await db.execute(count_query)).scalar_one()

    query = query.order_by(Finding.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    findings = list(result.scalars().all())

    return FindingListResponse(
        items=[FindingResponse.model_validate(f) for f in findings],
        total=total,
    )


@router.get("/export")
async def export_findings(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Export all findings for an engagement as JSON."""
    query = (
        select(Finding)
        .where(Finding.engagement_id == engagement_id)
        .order_by(Finding.severity.desc(), Finding.created_at)
    )
    result = await db.execute(query)
    findings = list(result.scalars().all())

    return [
        {
            "id": str(f.id),
            "title": f.title,
            "description": f.description,
            "severity": f.severity.value,
            "cvss_score": f.cvss_score,
            "affected_asset": f.affected_asset,
            "evidence": f.evidence,
            "created_at": f.created_at.isoformat(),
        }
        for f in findings
    ]


@router.get("/{finding_id}", response_model=FindingResponse)
async def get_finding(
    finding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> FindingResponse:
    """Get a single finding by ID."""
    finding = await db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return FindingResponse.model_validate(finding)


@router.post("", response_model=FindingResponse, status_code=status.HTTP_201_CREATED)
async def create_finding(
    body: FindingCreate,
    db: AsyncSession = Depends(get_db),
) -> FindingResponse:
    """Create a new finding."""
    finding = Finding(
        engagement_id=body.engagement_id,
        operation_id=body.operation_id,
        title=body.title,
        description=body.description,
        severity=body.severity,
        evidence=body.evidence,
        cvss_score=body.cvss_score,
        affected_asset=body.affected_asset,
    )
    db.add(finding)
    await db.flush()

    await ActionLogger.log(
        db,
        actor_id=None,
        action=AuditAction.FINDING_CREATED,
        resource_type="finding",
        resource_id=finding.id,
        details={"title": finding.title, "severity": finding.severity.value},
    )

    return FindingResponse.model_validate(finding)


@router.patch("/{finding_id}", response_model=FindingResponse)
async def update_finding(
    finding_id: uuid.UUID,
    body: FindingUpdate,
    db: AsyncSession = Depends(get_db),
) -> FindingResponse:
    """Update a finding."""
    finding = await db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(finding, field, value)

    await db.flush()

    await ActionLogger.log(
        db,
        actor_id=None,
        action=AuditAction.FINDING_UPDATED,
        resource_type="finding",
        resource_id=finding.id,
        details={"updated_fields": list(update_data.keys())},
    )

    return FindingResponse.model_validate(finding)


@router.delete("/{finding_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_finding(
    finding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a finding."""
    finding = await db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    await db.delete(finding)
    await db.flush()
