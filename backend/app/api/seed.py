"""One-time seed endpoint to bootstrap the default admin user."""

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.base import UserRole
from app.models.user import User
from app.schemas.auth import UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/seed-admin", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def seed_admin(
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Create the default admin user. Only works when the users table is empty."""
    count_result = await db.execute(select(func.count(User.id)))
    count = count_result.scalar_one()

    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Users already exist",
        )

    admin = User(
        email="admin@redteam.local",
        hashed_password=pwd_context.hash("admin123"),
        display_name="Admin",
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(admin)
    await db.flush()

    return UserResponse.model_validate(admin)
