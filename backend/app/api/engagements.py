"""Engagement CRUD + lifecycle endpoints."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.guardrails.action_logger import ActionLogger
from app.guardrails.kill_switch import kill_switch
from app.models.base import AuditAction, EngagementStatus
from app.models.engagement import Engagement
from app.models.user import User
from app.schemas.engagement import (
    EngagementCreate,
    EngagementListResponse,
    EngagementResponse,
    EngagementUpdate,
)
from app.services.orchestrator import OrchestratorService

router = APIRouter(prefix="/engagements", tags=["engagements"])


@router.get("", response_model=EngagementListResponse)
async def list_engagements(
    status_filter: EngagementStatus | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngagementListResponse:
    """List engagements with optional status filter."""
    query = select(Engagement)
    count_query = select(func.count(Engagement.id))

    if status_filter is not None:
        query = query.where(Engagement.status == status_filter)
        count_query = count_query.where(Engagement.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    query = query.order_by(Engagement.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    engagements = list(result.scalars().all())

    return EngagementListResponse(
        items=[EngagementResponse.model_validate(e) for e in engagements],
        total=total,
    )


@router.get("/{engagement_id}", response_model=EngagementResponse)
async def get_engagement(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngagementResponse:
    """Get a single engagement by ID."""
    engagement = await db.get(Engagement, engagement_id)
    if engagement is None:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return EngagementResponse.model_validate(engagement)


@router.post("", response_model=EngagementResponse, status_code=status.HTTP_201_CREATED)
async def create_engagement(
    body: EngagementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngagementResponse:
    """Create a new engagement in DRAFT status."""
    engagement = Engagement(
        name=body.name,
        scope_config=body.scope_config,
        rules_of_engagement=body.rules_of_engagement,
        start_date=body.start_date,
        end_date=body.end_date,
        status=EngagementStatus.DRAFT,
    )
    db.add(engagement)
    await db.flush()

    await ActionLogger.log(
        db,
        actor_id=current_user.id,
        action=AuditAction.ENGAGEMENT_CREATED,
        resource_type="engagement",
        resource_id=engagement.id,
        details={"name": engagement.name},
    )

    return EngagementResponse.model_validate(engagement)


@router.patch("/{engagement_id}", response_model=EngagementResponse)
async def update_engagement(
    engagement_id: uuid.UUID,
    body: EngagementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngagementResponse:
    """Update engagement fields (only while in DRAFT or PAUSED)."""
    engagement = await db.get(Engagement, engagement_id)
    if engagement is None:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status not in (EngagementStatus.DRAFT, EngagementStatus.PAUSED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot update engagement in {engagement.status.value} status",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(engagement, field, value)

    await db.flush()
    return EngagementResponse.model_validate(engagement)


@router.delete("/{engagement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_engagement(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a DRAFT engagement."""
    engagement = await db.get(Engagement, engagement_id)
    if engagement is None:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status != EngagementStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Only DRAFT engagements can be deleted",
        )

    await db.delete(engagement)
    await db.flush()


# ── Lifecycle actions ─────────────────────────────────────────────────


@router.post("/{engagement_id}/start", response_model=EngagementResponse)
async def start_engagement(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngagementResponse:
    """Transition an engagement to ACTIVE and plan the initial attack chain."""
    engagement = await db.get(Engagement, engagement_id)
    if engagement is None:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status not in (EngagementStatus.DRAFT, EngagementStatus.PAUSED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot start engagement in {engagement.status.value} status",
        )

    engagement.status = EngagementStatus.ACTIVE
    if engagement.start_date is None:
        engagement.start_date = datetime.now(timezone.utc)
    await db.flush()

    await ActionLogger.log(
        db,
        actor_id=current_user.id,
        action=AuditAction.ENGAGEMENT_STARTED,
        resource_type="engagement",
        resource_id=engagement.id,
        details={"name": engagement.name},
    )

    # Plan the attack chain
    orchestrator = OrchestratorService()
    await orchestrator.plan_attack_chain(db, engagement_id)

    return EngagementResponse.model_validate(engagement)


@router.post("/{engagement_id}/pause", response_model=EngagementResponse)
async def pause_engagement(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngagementResponse:
    """Pause an active engagement."""
    engagement = await db.get(Engagement, engagement_id)
    if engagement is None:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status != EngagementStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail="Can only pause ACTIVE engagements",
        )

    engagement.status = EngagementStatus.PAUSED
    await db.flush()

    await ActionLogger.log(
        db,
        actor_id=current_user.id,
        action=AuditAction.ENGAGEMENT_PAUSED,
        resource_type="engagement",
        resource_id=engagement.id,
    )

    return EngagementResponse.model_validate(engagement)


@router.post("/{engagement_id}/stop", response_model=EngagementResponse)
async def stop_engagement(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngagementResponse:
    """Stop an engagement and activate the kill switch."""
    engagement = await db.get(Engagement, engagement_id)
    if engagement is None:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status not in (EngagementStatus.ACTIVE, EngagementStatus.PAUSED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot stop engagement in {engagement.status.value} status",
        )

    engagement.status = EngagementStatus.ABORTED
    engagement.end_date = datetime.now(timezone.utc)
    await db.flush()

    # Activate kill switch so any in-flight operations are halted
    await kill_switch.activate(engagement_id)

    await ActionLogger.log(
        db,
        actor_id=current_user.id,
        action=AuditAction.ENGAGEMENT_ABORTED,
        resource_type="engagement",
        resource_id=engagement.id,
    )
    await ActionLogger.log(
        db,
        actor_id=current_user.id,
        action=AuditAction.KILL_SWITCH_ACTIVATED,
        resource_type="engagement",
        resource_id=engagement.id,
    )

    return EngagementResponse.model_validate(engagement)
