"""WebSocket endpoint for real-time event streaming."""

import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts events."""

    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str) -> None:
        await websocket.accept()
        self._connections[client_id] = websocket
        logger.info("WebSocket client connected: %s (total: %d)", client_id, len(self._connections))

    def disconnect(self, client_id: str) -> None:
        self._connections.pop(client_id, None)
        logger.info("WebSocket client disconnected: %s (total: %d)", client_id, len(self._connections))

    async def send_personal(self, client_id: str, message: dict[str, Any]) -> None:
        ws = self._connections.get(client_id)
        if ws is not None:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(client_id)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Send a message to every connected client."""
        disconnected: list[str] = []
        for client_id, ws in self._connections.items():
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(client_id)
        for cid in disconnected:
            self.disconnect(cid)

    @property
    def active_connections(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


# ── Helper for broadcasting from other modules ───────────────────────


async def broadcast_event(event_type: str, payload: dict[str, Any]) -> None:
    """Broadcast a typed event to all WebSocket clients.

    Event types:
    - operation_update
    - approval_required
    - finding_discovered
    - kill_switch_activated
    """
    await manager.broadcast({"type": event_type, "data": payload})


# ── WebSocket route ──────────────────────────────────────────────────


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint.

    Clients connect and optionally send a JSON ``{\"token\": \"...\"}`` for auth.
    They then receive broadcast events for the lifetime of the connection.
    Clients may send ``{\"subscribe\": [\"engagement:<id>\"]}`` to filter.
    """
    client_id = str(uuid.uuid4())

    await manager.connect(websocket, client_id)

    # Send a welcome message
    await manager.send_personal(
        client_id,
        {
            "type": "connected",
            "data": {"client_id": client_id, "message": "Connected to Red Team Orchestration Portal"},
        },
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_personal(
                    client_id, {"type": "error", "data": {"message": "Invalid JSON"}}
                )
                continue

            # Handle auth token (simplified — just acknowledge)
            if "token" in message:
                await manager.send_personal(
                    client_id,
                    {"type": "authenticated", "data": {"status": "ok"}},
                )

            # Handle subscription requests
            if "subscribe" in message:
                channels = message["subscribe"]
                await manager.send_personal(
                    client_id,
                    {"type": "subscribed", "data": {"channels": channels}},
                )

            # Handle ping
            if message.get("type") == "ping":
                await manager.send_personal(
                    client_id, {"type": "pong", "data": {}}
                )

    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception:
        logger.exception("WebSocket error for client %s", client_id)
        manager.disconnect(client_id)
