"""Approval queue endpoints."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ROLE_HIERARCHY, get_current_user
from app.database import get_db
from app.models.approval import ApprovalRequest
from app.models.base import ApprovalStatus, ApprovalTier, UserRole
from app.models.user import User
from app.schemas.approval import (
    ApprovalDecisionRequest,
    ApprovalResponse,
    BulkApprovalRequest,
)
from app.services.approval_engine import ApprovalEngine

router = APIRouter(prefix="/approvals", tags=["approvals"])

# Tier-to-minimum-role mapping for approval decisions
_TIER_MIN_ROLE: dict[ApprovalTier, UserRole] = {
    ApprovalTier.PASSIVE: UserRole.OPERATOR,
    ApprovalTier.ACTIVE: UserRole.OPERATOR,
    ApprovalTier.EXPLOIT: UserRole.SENIOR_OPERATOR,
    ApprovalTier.LATERAL: UserRole.LEAD,
}


def _check_tier_permission(tier: ApprovalTier, user: User) -> None:
    """Raise 403 if the user lacks permission for this approval tier."""
    min_role = _TIER_MIN_ROLE.get(tier, UserRole.OPERATOR)
    if ROLE_HIERARCHY.get(user.role, -1) < ROLE_HIERARCHY[min_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tier {tier.name} approvals require role {min_role.value} or above",
        )


@router.get("", response_model=list[ApprovalResponse])
async def list_approvals(
    tier: ApprovalTier | None = None,
    status_filter: ApprovalStatus | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ApprovalResponse]:
    """List approval requests with optional filters."""
    query = select(ApprovalRequest)
    if tier is not None:
        query = query.where(ApprovalRequest.tier == tier)
    if status_filter is not None:
        query = query.where(ApprovalRequest.status == status_filter)

    query = query.order_by(ApprovalRequest.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    items = list(result.scalars().all())
    return [ApprovalResponse.model_validate(a) for a in items]


@router.post("/{approval_id}/approve", response_model=ApprovalResponse)
async def approve(
    approval_id: uuid.UUID,
    body: ApprovalDecisionRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApprovalResponse:
    """Approve an approval request."""
    approval_req = await db.get(ApprovalRequest, approval_id)
    if approval_req is None:
        raise HTTPException(status_code=404, detail="Approval request not found")
    _check_tier_permission(approval_req.tier, current_user)

    notes = body.notes if body else None
    try:
        approval = await ApprovalEngine.process_decision(
            db,
            request_id=approval_id,
            approved=True,
            reviewer_id=current_user.id,
            notes=notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ApprovalResponse.model_validate(approval)


@router.post("/{approval_id}/deny", response_model=ApprovalResponse)
async def deny(
    approval_id: uuid.UUID,
    body: ApprovalDecisionRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApprovalResponse:
    """Deny an approval request."""
    approval_req = await db.get(ApprovalRequest, approval_id)
    if approval_req is None:
        raise HTTPException(status_code=404, detail="Approval request not found")
    _check_tier_permission(approval_req.tier, current_user)

    notes = body.notes if body else None
    try:
        approval = await ApprovalEngine.process_decision(
            db,
            request_id=approval_id,
            approved=False,
            reviewer_id=current_user.id,
            notes=notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ApprovalResponse.model_validate(approval)


@router.post("/bulk-approve", response_model=list[ApprovalResponse])
async def bulk_approve(
    body: BulkApprovalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ApprovalResponse]:
    """Approve multiple approval requests at once."""
    results: list[ApprovalResponse] = []
    for aid in body.approval_ids:
        approval_req = await db.get(ApprovalRequest, aid)
        if approval_req is None:
            continue
        try:
            _check_tier_permission(approval_req.tier, current_user)
        except HTTPException:
            # Skip approvals the user lacks permission for in bulk operations
            continue
        try:
            approval = await ApprovalEngine.process_decision(
                db,
                request_id=aid,
                approved=True,
                reviewer_id=current_user.id,
                notes=body.notes,
            )
            results.append(ApprovalResponse.model_validate(approval))
        except ValueError:
            # Skip already-decided requests in bulk operations
            continue
    return results
