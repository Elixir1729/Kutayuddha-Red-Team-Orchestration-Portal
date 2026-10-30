"""Scope validation service — thin wrapper around the guardrail enforcer."""

from app.guardrails.scope_enforcer import ScopeEnforcer
from app.models.engagement import Engagement
from app.models.operation import Operation


class ScopeValidator:
    """Validates that targets and operations fall within engagement scope."""

    @staticmethod
    def validate_target(target: str, scope_config: dict) -> bool:
        """Return True if *target* is permitted by *scope_config*."""
        return ScopeEnforcer.validate_target(target, scope_config)

    @staticmethod
    def validate_operation(operation: Operation, engagement: Engagement) -> bool:
        """Return True if the operation's target is within the engagement's scope."""
        return ScopeEnforcer.validate_operation(operation, engagement)
