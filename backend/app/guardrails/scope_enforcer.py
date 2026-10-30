"""Scope enforcement — raises if an operation targets something outside the engagement scope."""

import ipaddress
import re
from typing import Any

from app.models.engagement import Engagement
from app.models.operation import Operation


class ScopeViolation(Exception):
    """Raised when an operation violates the engagement scope."""

    def __init__(self, operation_id: Any, target: str, reason: str) -> None:
        self.operation_id = operation_id
        self.target = target
        self.reason = reason
        super().__init__(f"Scope violation for operation {operation_id}: {reason}")


class ScopeEnforcer:
    """Validates that operations stay within the defined engagement scope."""

    @staticmethod
    def _target_in_cidr(target: str, cidr: str) -> bool:
        """Check whether *target* (an IP or hostname that looks like an IP) falls in *cidr*."""
        try:
            addr = ipaddress.ip_address(target)
            network = ipaddress.ip_network(cidr, strict=False)
            return addr in network
        except ValueError:
            return False

    @staticmethod
    def _target_matches_domain(target: str, domain_pattern: str) -> bool:
        """Glob-style domain matching (e.g. ``*.example.com``)."""
        pattern = domain_pattern.replace(".", r"\.").replace("*", r"[a-zA-Z0-9\-]*")
        return bool(re.fullmatch(pattern, target, re.IGNORECASE))

    @classmethod
    def validate_target(cls, target: str, scope_config: dict) -> bool:
        """Return True if *target* is within the scope described by *scope_config*.

        ``scope_config`` supports:
        - ``allowed_cidrs``: list of CIDR ranges
        - ``allowed_domains``: list of domain patterns (glob ``*`` supported)
        - ``allowed_hosts``: explicit hostnames / IPs
        - ``excluded_cidrs``: deny-list CIDRs (checked first)
        - ``excluded_hosts``: deny-list hostnames
        """
        excluded_cidrs: list[str] = scope_config.get("excluded_cidrs", [])
        for cidr in excluded_cidrs:
            if cls._target_in_cidr(target, cidr):
                return False

        excluded_hosts: list[str] = scope_config.get("excluded_hosts", [])
        if target.lower() in {h.lower() for h in excluded_hosts}:
            return False

        # If no allow-lists are defined, everything is in scope
        allowed_cidrs: list[str] = scope_config.get("allowed_cidrs", [])
        allowed_domains: list[str] = scope_config.get("allowed_domains", [])
        allowed_hosts: list[str] = scope_config.get("allowed_hosts", [])

        if not allowed_cidrs and not allowed_domains and not allowed_hosts:
            return True

        for cidr in allowed_cidrs:
            if cls._target_in_cidr(target, cidr):
                return True

        if target.lower() in {h.lower() for h in allowed_hosts}:
            return True

        for domain_pattern in allowed_domains:
            if cls._target_matches_domain(target, domain_pattern):
                return True

        return False

    @classmethod
    def validate_operation(cls, operation: Operation, engagement: Engagement) -> bool:
        """Return True if the operation's target is within the engagement's scope."""
        return cls.validate_target(operation.target, engagement.scope_config)

    @classmethod
    def enforce(cls, operation: Operation, engagement: Engagement) -> None:
        """Raise ``ScopeViolation`` if the operation targets something out-of-scope."""
        if not cls.validate_operation(operation, engagement):
            raise ScopeViolation(
                operation_id=operation.id,
                target=operation.target,
                reason=(
                    f"Target '{operation.target}' is outside the allowed scope "
                    f"for engagement '{engagement.name}'"
                ),
            )
