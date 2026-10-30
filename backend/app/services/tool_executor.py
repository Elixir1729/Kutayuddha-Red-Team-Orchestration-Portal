"""Tool executor — dispatches operations to the correct domain handler."""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.guardrails.action_logger import ActionLogger
from app.guardrails.kill_switch import kill_switch
from app.guardrails.middleware import GuardrailMiddleware
from app.models.base import AuditAction, OperationStatus, ToolDomain
from app.models.operation import Operation
from app.tools.base import ToolResult
from app.tools.registry import tool_registry

logger = logging.getLogger(__name__)


class ToolExecutor:
    """Routes operations to domain-specific execution methods and parses output."""

    # ── Dispatch ──────────────────────────────────────────────────────

    async def dispatch(
        self,
        db: AsyncSession,
        operation: Operation,
        actor_id: Optional[uuid.UUID] = None,
    ) -> Operation:
        """Execute an operation end-to-end: guardrails -> domain handler -> output parsing."""
        # Pre-execution guardrails (kill switch, scope, audit)
        await GuardrailMiddleware.pre_execute(db, operation, actor_id)

        # Double-check kill switch right before execution.
        if await kill_switch.is_active(operation.engagement_id):
            operation.status = OperationStatus.BLOCKED
            await db.flush()
            logger.warning(
                "Operation %s blocked by kill switch just before execution",
                operation.id,
            )
            return operation

        operation.status = OperationStatus.EXECUTING
        await db.flush()

        # Log execution start.
        await ActionLogger.log(
            db,
            actor_id=actor_id,
            action=AuditAction.OPERATION_EXECUTED,
            resource_type="operation",
            resource_id=operation.id,
            details={
                "action_type": operation.action_type,
                "target": operation.target,
                "tool_domain": operation.tool_domain.value,
                "phase": "execution_start",
            },
        )

        success = False
        try:
            # Try the tool registry first; fall back to legacy mock handlers.
            if tool_registry.has_real_wrapper(operation.tool_domain, operation.action_type.lower()):
                result = await self._execute_via_registry(operation)
                operation.output = result.to_dict()
                operation.status = (
                    OperationStatus.COMPLETED if result.success else OperationStatus.FAILED
                )
                success = result.success
            else:
                raw_output = await self._route_to_domain(operation)
                parsed = self.parse_output(raw_output)
                operation.output = parsed
                operation.status = OperationStatus.COMPLETED
                success = True
        except Exception as exc:
            logger.exception("Operation %s failed: %s", operation.id, exc)
            operation.output = {"error": str(exc)}
            operation.status = OperationStatus.FAILED
        finally:
            # Log execution end.
            await ActionLogger.log(
                db,
                actor_id=actor_id,
                action=AuditAction.OPERATION_EXECUTED if success else AuditAction.OPERATION_FAILED,
                resource_type="operation",
                resource_id=operation.id,
                details={
                    "action_type": operation.action_type,
                    "target": operation.target,
                    "tool_domain": operation.tool_domain.value,
                    "phase": "execution_end",
                    "success": success,
                },
            )
            await GuardrailMiddleware.post_execute(db, operation, success, actor_id)
            await db.flush()

        return operation

    # ── Registry-based execution ──────────────────────────────────────

    async def _execute_via_registry(self, operation: Operation) -> ToolResult:
        """Look up a real tool wrapper from the registry and execute it."""
        wrapper = tool_registry.get(operation.tool_domain, operation.action_type.lower())

        parameters = dict(operation.parameters) if operation.parameters else {}
        parameters["action_type"] = operation.action_type.lower()

        logger.info(
            "Executing %s wrapper for %s against %s",
            wrapper.name,
            operation.action_type,
            operation.target,
        )

        return await wrapper.execute(target=operation.target, parameters=parameters)

    # ── Legacy dispatch (mock handlers) ───────────────────────────────

    async def _route_to_domain(self, operation: Operation) -> dict[str, Any]:
        """Route to the correct legacy domain handler (mock)."""
        handlers = {
            ToolDomain.AD: self.execute_ad,
            ToolDomain.CLOUD: self.execute_cloud,
            ToolDomain.NETWORK: self.execute_network,
            ToolDomain.AI_LLM: self.execute_ai,
        }
        handler = handlers.get(operation.tool_domain)
        if handler is None:
            raise ValueError(f"Unknown tool domain: {operation.tool_domain}")
        return await handler(operation)

    # ── Domain handlers (legacy mock implementations) ─────────────────
    # These remain as fallback for action types without a real wrapper.

    async def execute_ad(self, operation: Operation) -> dict[str, Any]:
        """Execute an Active Directory domain operation (mock)."""
        action = operation.action_type.lower()
        target = operation.target
        params = operation.parameters

        if action == "bloodhound_collection":
            return {
                "tool": "SharpHound",
                "target": target,
                "collection_methods": params.get("methods", ["All"]),
                "status": "completed",
                "data": {
                    "users_collected": 247,
                    "computers_collected": 53,
                    "groups_collected": 38,
                    "sessions_collected": 12,
                    "output_file": f"bloodhound_{target}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.zip",
                },
            }
        elif action == "credential_spray":
            return {
                "tool": "CrackMapExec",
                "target": target,
                "protocol": params.get("protocol", "smb"),
                "status": "completed",
                "data": {
                    "accounts_tested": params.get("user_count", 50),
                    "valid_credentials": 2,
                    "locked_accounts": 0,
                    "results": [
                        {"user": "svc_backup", "status": "pwned"},
                        {"user": "admin_test", "status": "pwned"},
                    ],
                },
            }
        elif action == "credential_dump":
            return {
                "tool": "Mimikatz",
                "target": target,
                "technique": params.get("technique", "sekurlsa::logonpasswords"),
                "status": "completed",
                "data": {
                    "credentials_found": 5,
                    "credential_types": ["NTLM", "Kerberos"],
                },
            }
        elif action == "privilege_escalation":
            return {
                "tool": "Rubeus",
                "target": target,
                "technique": params.get("technique", "kerberoast"),
                "status": "completed",
                "data": {
                    "spns_found": 3,
                    "tickets_extracted": 3,
                    "crackable": True,
                },
            }
        else:
            return {
                "tool": "ad_generic",
                "target": target,
                "action": action,
                "status": "completed",
                "data": {"message": f"AD action '{action}' executed against {target}"},
            }

    async def execute_cloud(self, operation: Operation) -> dict[str, Any]:
        """Execute a cloud domain operation (mock)."""
        action = operation.action_type.lower()
        target = operation.target
        params = operation.parameters

        if action == "cloud_audit":
            return {
                "tool": "ScoutSuite",
                "target": target,
                "provider": params.get("provider", "aws"),
                "status": "completed",
                "data": {
                    "services_scanned": 15,
                    "findings": {
                        "critical": 2,
                        "high": 5,
                        "medium": 12,
                        "low": 23,
                    },
                    "public_resources": ["s3://company-backups", "ec2:i-0abc123"],
                },
            }
        elif action == "cloud_enum":
            return {
                "tool": "Prowler",
                "target": target,
                "provider": params.get("provider", "aws"),
                "status": "completed",
                "data": {
                    "iam_users": 34,
                    "iam_roles": 22,
                    "s3_buckets": 15,
                    "ec2_instances": 28,
                    "lambda_functions": 12,
                    "exposed_services": 3,
                },
            }
        elif action == "token_theft":
            return {
                "tool": "cloud_token_extractor",
                "target": target,
                "status": "completed",
                "data": {
                    "tokens_found": 2,
                    "token_types": ["aws_session", "azure_ad"],
                    "privilege_level": "admin",
                },
            }
        else:
            return {
                "tool": "cloud_generic",
                "target": target,
                "action": action,
                "status": "completed",
                "data": {"message": f"Cloud action '{action}' executed against {target}"},
            }

    async def execute_network(self, operation: Operation) -> dict[str, Any]:
        """Execute a network domain operation (mock)."""
        action = operation.action_type.lower()
        target = operation.target
        params = operation.parameters

        if action == "port_scan":
            return {
                "tool": "nmap",
                "target": target,
                "scan_type": params.get("scan_type", "-sV -sC"),
                "status": "completed",
                "data": {
                    "hosts_up": 1,
                    "open_ports": [
                        {"port": 22, "service": "ssh", "version": "OpenSSH 8.9"},
                        {"port": 80, "service": "http", "version": "nginx 1.24"},
                        {"port": 443, "service": "https", "version": "nginx 1.24"},
                        {"port": 3306, "service": "mysql", "version": "MySQL 8.0"},
                    ],
                },
            }
        elif action == "dns_enum":
            return {
                "tool": "dnsrecon",
                "target": target,
                "status": "completed",
                "data": {
                    "records_found": 12,
                    "record_types": {"A": 5, "CNAME": 3, "MX": 2, "TXT": 2},
                    "subdomains": [f"www.{target}", f"mail.{target}", f"vpn.{target}"],
                },
            }
        elif action == "vuln_scan":
            return {
                "tool": "Nuclei",
                "target": target,
                "templates": params.get("templates", "cves,default-logins"),
                "status": "completed",
                "data": {
                    "vulnerabilities": [
                        {"id": "CVE-2024-1234", "severity": "high", "title": "RCE via deserialization"},
                        {"id": "CVE-2023-5678", "severity": "medium", "title": "XSS in login"},
                    ],
                    "total_requests": 4521,
                    "total_findings": 2,
                },
            }
        elif action == "exploit":
            return {
                "tool": "metasploit",
                "target": target,
                "module": params.get("module", "exploit/multi/handler"),
                "status": "completed",
                "data": {
                    "session_id": 1,
                    "session_type": "meterpreter",
                    "access_level": params.get("expected_access", "user"),
                },
            }
        elif action == "lateral_movement":
            return {
                "tool": "CrackMapExec",
                "target": target,
                "technique": params.get("technique", "psexec"),
                "status": "completed",
                "data": {
                    "source": params.get("source_host", "pivot-01"),
                    "destination": target,
                    "access_gained": True,
                    "session_type": "shell",
                },
            }
        else:
            return {
                "tool": "network_generic",
                "target": target,
                "action": action,
                "status": "completed",
                "data": {"message": f"Network action '{action}' executed against {target}"},
            }

    async def execute_ai(self, operation: Operation) -> dict[str, Any]:
        """Execute an AI/LLM domain operation (mock)."""
        action = operation.action_type.lower()
        target = operation.target
        params = operation.parameters

        if action == "config_review":
            return {
                "tool": "llm_config_scanner",
                "target": target,
                "status": "completed",
                "data": {
                    "model_endpoint": target,
                    "authentication": "api_key",
                    "rate_limiting": True,
                    "input_filtering": params.get("check_filters", True),
                    "output_filtering": False,
                    "issues": ["No output content filtering", "API key in URL parameter"],
                },
            }
        elif action in ("exploit", "prompt_injection"):
            return {
                "tool": "llm_exploit_framework",
                "target": target,
                "technique": params.get("technique", "prompt_injection"),
                "status": "completed",
                "data": {
                    "attack_vector": "indirect_prompt_injection",
                    "success": True,
                    "exfiltrated_data": "system_prompt",
                    "severity": "high",
                },
            }
        else:
            return {
                "tool": "ai_generic",
                "target": target,
                "action": action,
                "status": "completed",
                "data": {"message": f"AI/LLM action '{action}' executed against {target}"},
            }

    # ── Output parsing ────────────────────────────────────────────────

    @staticmethod
    def parse_output(raw: dict[str, Any]) -> dict[str, Any]:
        """Parse and normalise raw tool output into a structured format."""
        return {
            "tool": raw.get("tool", "unknown"),
            "target": raw.get("target", "unknown"),
            "status": raw.get("status", "unknown"),
            "executed_at": datetime.now(timezone.utc).isoformat(),
            "data": raw.get("data", {}),
        }
