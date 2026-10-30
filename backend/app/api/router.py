"""Main API router — aggregates all sub-routers under /api/v1."""

from fastapi import APIRouter

from app.api import approvals, audit, auth, dashboard, engagements, findings, operations, seed, ws

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(seed.router)
api_router.include_router(engagements.router)
api_router.include_router(operations.router)
api_router.include_router(approvals.router)
api_router.include_router(findings.router)
api_router.include_router(audit.router)
api_router.include_router(dashboard.router)

# WebSocket lives at the top level (/ws), not under /api/v1
ws_router = ws.router
