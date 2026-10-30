"""Wrapper around the *prowler* CLI for AWS cloud security auditing."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from app.models.base import ToolDomain
from app.tools.base import ToolResult, ToolWrapper

logger = logging.getLogger(__name__)

# Action types this wrapper handles.
SUPPORTED_ACTIONS = {"cloud_audit", "config_review"}

# Default timeout for a prowler run (seconds).  Cloud audits can be slow.
DEFAULT_TIMEOUT = 900

# Prowler severity ➜ our internal severity.
_PROWLER_SEVERITY_MAP: dict[str, str] = {
    "critical": "CRITICAL",
    "high": "HIGH",
    "medium": "MEDIUM",
    "low": "LOW",
    "informational": "INFO",
}

# Prowler status ➜ our finding severity fallback.
_STATUS_SEVERITY_MAP: dict[str, str] = {
    "FAIL": "HIGH",
    "WARNING": "MEDIUM",
    "PASS": "INFO",
    "INFO": "INFO",
}


class ProwlerWrapper(ToolWrapper):
    """Executes *prowler* cloud audits and returns structured results."""

    name: str = "prowler"
    domain: ToolDomain = ToolDomain.CLOUD

    def __init__(self, timeout: int = DEFAULT_TIMEOUT) -> None:
        self.timeout = timeout

    # ── Validation ────────────────────────────────────────────────────

    async def validate_params(self, parameters: dict) -> bool:
        """Validate that the provided parameters are sensible."""
        action = parameters.get("action_type", "cloud_audit")
        if action not in SUPPORTED_ACTIONS:
            raise ValueError(
                f"Unsupported action_type '{action}'. "
                f"Supported: {', '.join(sorted(SUPPORTED_ACTIONS))}"
            )

        specific_checks = parameters.get("specific_checks")
        if specific_checks is not None and not isinstance(specific_checks, list):
            raise ValueError("'specific_checks' must be a list of check IDs")

        return True

    # ── Execution ─────────────────────────────────────────────────────

    async def execute(self, target: str, parameters: dict) -> ToolResult:
        """Run *prowler* and return parsed results."""
        if not self.binary_available("prowler"):
            return ToolResult(
                success=False,
                raw_output="",
                error="prowler is not installed or not found on $PATH. "
                      "Install it with: pip install prowler",
            )

        await self.validate_params(parameters)

        action = parameters.get("action_type", "cloud_audit")
        timeout = parameters.get("timeout", self.timeout)

        # Each run gets its own output directory so parallel runs don't collide.
        run_id = uuid.uuid4().hex[:12]
        output_dir = Path(f"/tmp/prowler-{run_id}")
        output_dir.mkdir(parents=True, exist_ok=True)

        cmd = self._build_command(action, target, parameters, str(output_dir))
        logger.info("Executing prowler: %s (timeout=%ds)", " ".join(cmd), timeout)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()  # type: ignore[union-attr]
            except ProcessLookupError:
                pass
            _cleanup_dir(output_dir)
            return ToolResult(
                success=False,
                raw_output="",
                error=f"prowler timed out after {timeout} seconds",
            )
        except OSError as exc:
            _cleanup_dir(output_dir)
            return ToolResult(
                success=False,
                raw_output="",
                error=f"Failed to start prowler process: {exc}",
            )

        raw_stdout = stdout_bytes.decode("utf-8", errors="replace")
        raw_stderr = stderr_bytes.decode("utf-8", errors="replace")

        if proc.returncode not in (0, 3):
            # prowler exit code 3 = findings detected (not an error).
            _cleanup_dir(output_dir)
            return ToolResult(
                success=False,
                raw_output=raw_stdout,
                error=f"prowler exited with code {proc.returncode}: {raw_stderr.strip()}",
            )

        # Read the JSON output file prowler wrote.
        try:
            raw_json = self._read_output_json(output_dir)
        except FileNotFoundError:
            _cleanup_dir(output_dir)
            return ToolResult(
                success=False,
                raw_output=raw_stdout,
                error="prowler completed but no JSON output file was found in "
                      f"{output_dir}. stderr: {raw_stderr.strip()}",
            )
        except json.JSONDecodeError as exc:
            _cleanup_dir(output_dir)
            return ToolResult(
                success=False,
                raw_output=raw_stdout,
                error=f"Failed to parse prowler JSON output: {exc}",
            )

        _cleanup_dir(output_dir)

        try:
            parsed = await self.parse_output(raw_json)
        except Exception as exc:
            return ToolResult(
                success=False,
                raw_output=raw_stdout,
                error=f"Failed to parse prowler output: {exc}",
            )

        findings = self._generate_findings(parsed)

        return ToolResult(
            success=True,
            raw_output=raw_stdout,
            parsed=parsed,
            findings=findings,
        )

    # ── Command building ──────────────────────────────────────────────

    @staticmethod
    def _build_command(
        action: str,
        target: str,
        parameters: dict,
        output_dir: str,
    ) -> list[str]:
        """Build the prowler CLI command."""
        cmd = ["prowler", "aws"]

        # Output settings.
        cmd += ["--output-formats", "json", "--output-directory", output_dir]

        # AWS profile.
        profile = parameters.get("aws_profile")
        if profile:
            cmd += ["--profile", str(profile)]

        # AWS region.
        region = parameters.get("region")
        if region:
            cmd += ["--region", str(region)]

        # Specific checks.
        specific_checks: list[str] | None = parameters.get("specific_checks")
        if action == "config_review" and specific_checks:
            cmd += ["--checks"] + [str(c) for c in specific_checks]
        elif action == "config_review":
            # Default config-review checks cover IAM, S3, logging, etc.
            cmd += [
                "--checks",
                "iam_root_hardware_mfa_enabled",
                "iam_no_root_access_key",
                "s3_bucket_public_access",
                "cloudtrail_multi_region_enabled",
                "ec2_securitygroup_default_restrict_traffic",
            ]

        return cmd

    # ── Output reading / parsing ──────────────────────────────────────

    @staticmethod
    def _read_output_json(output_dir: Path) -> str:
        """Find and read the prowler JSON output file.

        Prowler writes output files with names like
        ``prowler-output-<timestamp>.json``.  We pick the first ``.json``
        file found.
        """
        json_files = sorted(output_dir.glob("**/*.json"))
        if not json_files:
            raise FileNotFoundError("No JSON file found in prowler output directory")
        return json_files[0].read_text(encoding="utf-8")

    async def parse_output(self, raw_output: str) -> dict:
        """Parse prowler JSON output into a structured summary dict."""
        # Prowler may write an array of check results or newline-delimited JSON.
        checks = _load_prowler_json(raw_output)

        passed = 0
        failed = 0
        warnings = 0

        check_results: list[dict[str, Any]] = []
        for check in checks:
            status = check.get("StatusExtended", check.get("Status", "UNKNOWN")).upper()
            if "PASS" in status:
                passed += 1
            elif "FAIL" in status:
                failed += 1
            elif "WARN" in status or "WARNING" in status:
                warnings += 1

            check_results.append(
                {
                    "check_id": check.get("CheckID", check.get("check_id", "")),
                    "status": check.get("Status", ""),
                    "severity": check.get("Severity", check.get("severity", "informational")),
                    "description": check.get(
                        "StatusExtended",
                        check.get("Description", check.get("description", "")),
                    ),
                    "resource": check.get(
                        "ResourceId", check.get("resource_id", "")
                    ),
                    "region": check.get("Region", check.get("region", "")),
                }
            )

        return {
            "checks_run": len(checks),
            "passed": passed,
            "failed": failed,
            "warnings": warnings,
            "findings": check_results,
        }

    # ── Finding generation ────────────────────────────────────────────

    @staticmethod
    def _generate_findings(parsed: dict) -> list[dict]:
        """Convert prowler check results into our internal finding format."""
        findings: list[dict] = []

        for check in parsed.get("findings", []):
            status = check.get("status", "").upper()
            # Only generate findings for non-PASS results.
            if "PASS" in status:
                continue

            prowler_severity = check.get("severity", "informational").lower()
            severity = _PROWLER_SEVERITY_MAP.get(
                prowler_severity,
                _STATUS_SEVERITY_MAP.get(status, "INFO"),
            )

            findings.append(
                {
                    "title": f"[{check.get('check_id', 'unknown')}] {check.get('description', '')}",
                    "description": (
                        f"Prowler check {check.get('check_id', '')} returned {status} "
                        f"for resource {check.get('resource', 'N/A')} "
                        f"in region {check.get('region', 'N/A')}."
                    ),
                    "severity": severity,
                    "affected_asset": check.get("resource", ""),
                }
            )

        return findings


# ── Module-private helpers ────────────────────────────────────────────


def _load_prowler_json(raw: str) -> list[dict]:
    """Load prowler output which may be a JSON array or newline-delimited JSON."""
    raw = raw.strip()
    if not raw:
        return []

    # Try parsing as a single JSON array first.
    if raw.startswith("["):
        return json.loads(raw)

    # Newline-delimited JSON (one object per line).
    results: list[dict] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        results.append(json.loads(line))
    return results


def _cleanup_dir(path: Path) -> None:
    """Best-effort removal of a temporary directory."""
    try:
        shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass
