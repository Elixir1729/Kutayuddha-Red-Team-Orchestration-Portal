"""Kill switch — uses Redis for instant propagation across workers."""

import uuid
from typing import Optional

import redis.asyncio as aioredis

from app.config import settings

KILL_SWITCH_PREFIX = "killswitch:engagement:"


class KillSwitch:
    """Global kill switch backed by Redis for immediate cross-process propagation."""

    def __init__(self, redis_client: Optional[aioredis.Redis] = None) -> None:
        self._redis: Optional[aioredis.Redis] = redis_client

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return self._redis

    def _key(self, engagement_id: uuid.UUID) -> str:
        return f"{KILL_SWITCH_PREFIX}{engagement_id}"

    async def activate(self, engagement_id: uuid.UUID) -> None:
        """Activate the kill switch for an engagement — all operations halt immediately."""
        r = await self._get_redis()
        await r.set(self._key(engagement_id), "1")
        # Publish for real-time listeners
        await r.publish("killswitch", str(engagement_id))

    async def deactivate(self, engagement_id: uuid.UUID) -> None:
        """Deactivate the kill switch, allowing operations to resume."""
        r = await self._get_redis()
        await r.delete(self._key(engagement_id))

    async def is_active(self, engagement_id: uuid.UUID) -> bool:
        """Check whether the kill switch is currently active."""
        r = await self._get_redis()
        return bool(await r.exists(self._key(engagement_id)))

    async def list_active(self) -> list[str]:
        """Return engagement IDs that currently have the kill switch active."""
        r = await self._get_redis()
        keys = []
        async for key in r.scan_iter(match=f"{KILL_SWITCH_PREFIX}*"):
            eid = key.removeprefix(KILL_SWITCH_PREFIX)
            keys.append(eid)
        return keys

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.close()


# Module-level singleton
kill_switch = KillSwitch()
