"""Operations endpoints — list, detail, cancel."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.guardrails.action_logger import ActionLogger
from app.models.base import AuditAction, OperationStatus, ToolDomain
from app.models.operation import Operation
from app.schemas.operation import OperationListResponse, OperationResponse

router = APIRouter(prefix="/operations", tags=["operations"])


@router.get("", response_model=OperationListResponse)
async def list_operations(
    engagement_id: uuid.UUID | None = None,
    status_filter: OperationStatus | None = None,
    domain: ToolDomain | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> OperationListResponse:
    """List operations with optional filters."""
    query = select(Operation)
    count_query = select(func.count(Operation.id))

    if engagement_id is not None:
        query = query.where(Operation.engagement_id == engagement_id)
        count_query = count_query.where(Operation.engagement_id == engagement_id)
    if status_filter is not None:
        query = query.where(Operation.status == status_filter)
        count_query = count_query.where(Operation.status == status_filter)
    if domain is not None:
        query = query.where(Operation.tool_domain == domain)
        count_query = count_query.where(Operation.tool_domain == domain)

    total = (await db.execute(count_query)).scalar_one()

    query = query.order_by(Operation.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    operations = list(result.scalars().all())

    return OperationListResponse(
        items=[OperationResponse.model_validate(op) for op in operations],
        total=total,
    )


@router.get("/{operation_id}", response_model=OperationResponse)
async def get_operation(
    operation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> OperationResponse:
    """Get a single operation by ID."""
    operation = await db.get(Operation, operation_id)
    if operation is None:
        raise HTTPException(status_code=404, detail="Operation not found")
    return OperationResponse.model_validate(operation)


@router.post("/{operation_id}/cancel", response_model=OperationResponse)
async def cancel_operation(
    operation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> OperationResponse:
    """Cancel a PLANNED or PENDING_APPROVAL operation."""
    operation = await db.get(Operation, operation_id)
    if operation is None:
        raise HTTPException(status_code=404, detail="Operation not found")

    cancellable = {
        OperationStatus.PLANNED,
        OperationStatus.PENDING_APPROVAL,
        OperationStatus.APPROVED,
    }
    if operation.status not in cancellable:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel operation in {operation.status.value} status",
        )

    operation.status = OperationStatus.CANCELLED
    await db.flush()

    await ActionLogger.log(
        db,
        actor_id=None,
        action=AuditAction.OPERATION_CANCELLED,
        resource_type="operation",
        resource_id=operation.id,
        details={"previous_status": operation.status.value},
    )

    return OperationResponse.model_validate(operation)
