"""Abstract base class for tool wrappers and shared data types."""

from __future__ import annotations

import abc
import shutil
from dataclasses import dataclass, field
from typing import Optional

from app.models.base import ToolDomain


@dataclass
class ToolResult:
    """Standardised result returned by every tool wrapper."""

    success: bool
    raw_output: str
    parsed: dict = field(default_factory=dict)
    findings: list[dict] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> dict:
        """Serialise the result for JSON storage in Operation.output."""
        d: dict = {
            "success": self.success,
            "parsed": self.parsed,
            "findings": self.findings,
        }
        if self.error is not None:
            d["error"] = self.error
        # raw_output can be very large; include it only if execution succeeded
        if self.success:
            d["raw_output_length"] = len(self.raw_output)
        return d


class ToolWrapper(abc.ABC):
    """Contract that every concrete tool wrapper must implement."""

    name: str
    domain: ToolDomain

    # ── Public interface ─────────────────────────────────────────────

    @abc.abstractmethod
    async def validate_params(self, parameters: dict) -> bool:
        """Return *True* if *parameters* are valid; raise ValueError otherwise."""

    @abc.abstractmethod
    async def execute(self, target: str, parameters: dict) -> ToolResult:
        """Run the underlying tool and return a structured result."""

    @abc.abstractmethod
    async def parse_output(self, raw_output: str) -> dict:
        """Parse *raw_output* (usually stdout) into a structured dict."""

    # ── Helpers available to all wrappers ─────────────────────────────

    @staticmethod
    def binary_available(binary_name: str) -> bool:
        """Check whether *binary_name* is on $PATH."""
        return shutil.which(binary_name) is not None
