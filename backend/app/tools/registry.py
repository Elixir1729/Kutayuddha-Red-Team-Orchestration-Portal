"""Central registry that maps (ToolDomain, action_type) to ToolWrapper instances."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from app.models.base import ToolDomain
from app.tools.base import ToolResult, ToolWrapper

logger = logging.getLogger(__name__)


class MockWrapper(ToolWrapper):
    """Fallback wrapper that returns canned output for unimplemented tools.

    Used so domains / action-types without a real wrapper do not crash —
    they simply return a descriptive mock result.
    """

    name: str = "mock"
    domain: ToolDomain = ToolDomain.NETWORK  # overridden dynamically

    async def validate_params(self, parameters: dict) -> bool:
        return True

    async def execute(self, target: str, parameters: dict) -> ToolResult:
        action = parameters.get("action_type", "unknown")
        return ToolResult(
            success=True,
            raw_output="",
            parsed={
                "tool": "mock",
                "target": target,
                "action": action,
                "status": "completed",
                "executed_at": datetime.now(timezone.utc).isoformat(),
                "data": {
                    "message": (
                        f"Mock execution of '{action}' against {target}. "
                        "No real tool wrapper is registered for this action."
                    ),
                },
            },
            findings=[],
        )

    async def parse_output(self, raw_output: str) -> dict:
        return {}


class ToolRegistry:
    """Maps (ToolDomain, action_type) pairs to concrete :class:`ToolWrapper` instances.

    If no wrapper is registered for the requested combination the registry
    falls back to :class:`MockWrapper`.
    """

    def __init__(self) -> None:
        # {(ToolDomain, action_type): ToolWrapper}
        self._registry: dict[tuple[ToolDomain, str], ToolWrapper] = {}
        self._mock = MockWrapper()

    # ── Registration ──────────────────────────────────────────────────

    def register(
        self,
        wrapper: ToolWrapper,
        action_types: list[str],
    ) -> None:
        """Register *wrapper* for each action_type under its domain."""
        for action in action_types:
            key = (wrapper.domain, action)
            self._registry[key] = wrapper
            logger.debug("Registered tool wrapper %s for %s", wrapper.name, key)

    # ── Lookup ────────────────────────────────────────────────────────

    def get(self, domain: ToolDomain, action_type: str) -> ToolWrapper:
        """Return the wrapper for *domain* + *action_type*, or the mock fallback."""
        key = (domain, action_type)
        wrapper = self._registry.get(key)
        if wrapper is None:
            logger.info(
                "No real wrapper for %s — falling back to MockWrapper", key
            )
            return self._mock
        return wrapper

    def has_real_wrapper(self, domain: ToolDomain, action_type: str) -> bool:
        """Return True if a non-mock wrapper is registered."""
        return (domain, action_type) in self._registry

    def registered_actions(self) -> list[tuple[str, str]]:
        """Return a list of (domain, action_type) pairs with real wrappers."""
        return [(d.value, a) for d, a in self._registry]


# ── Module-level singleton ────────────────────────────────────────────

def _build_default_registry() -> ToolRegistry:
    """Create and populate the default registry."""
    from app.tools.nmap_wrapper import NmapWrapper, SUPPORTED_ACTIONS as NMAP_ACTIONS
    from app.tools.prowler_wrapper import ProwlerWrapper, SUPPORTED_ACTIONS as PROWLER_ACTIONS

    registry = ToolRegistry()

    # Nmap — NETWORK domain
    nmap = NmapWrapper()
    registry.register(nmap, list(NMAP_ACTIONS))

    # Prowler — CLOUD domain
    prowler = ProwlerWrapper()
    registry.register(prowler, list(PROWLER_ACTIONS))

    return registry


tool_registry: ToolRegistry = _build_default_registry()
