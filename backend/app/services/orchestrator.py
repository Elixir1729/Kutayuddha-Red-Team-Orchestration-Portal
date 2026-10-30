"""Orchestrator service — plans and drives attack chains via Claude API."""

import json
import logging
import uuid
from typing import Any, Optional

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.guardrails.action_logger import ActionLogger
from app.guardrails.kill_switch import kill_switch
from app.models.base import (
    AuditAction,
    EngagementStatus,
    FindingSeverity,
    OperationStatus,
    ToolDomain,
)
from app.models.engagement import Engagement
from app.models.finding import Finding
from app.models.operation import Operation
from app.services.approval_engine import ApprovalEngine
from app.services.prompts import (
    SYSTEM_PROMPT_ANALYZER,
    SYSTEM_PROMPT_DECISION,
    SYSTEM_PROMPT_PLANNER,
    build_analyzer_user_message,
    build_decision_user_message,
    build_planner_user_message,
)
from app.services.scope_validator import ScopeValidator
from app.services.tool_executor import ToolExecutor

logger = logging.getLogger(__name__)

# Timeout for Claude API calls (seconds)
_API_TIMEOUT = 60.0

# Valid values for enum mapping
_TOOL_DOMAIN_MAP: dict[str, ToolDomain] = {v.value: v for v in ToolDomain}
_SEVERITY_MAP: dict[str, FindingSeverity] = {v.value: v for v in FindingSeverity}


class OrchestratorService:
    """Plans and executes red-team attack chains using Claude for decision-making.

    When ANTHROPIC_API_KEY is configured, the orchestrator calls Claude to plan
    attack chains, analyse tool output, and decide next steps.  When the key is
    missing or an API call fails, it falls back to deterministic mock logic so
    the rest of the system can still be exercised.
    """

    def __init__(self) -> None:
        self.tool_executor = ToolExecutor()
        self._client: Optional[anthropic.AsyncAnthropic] = None

        if settings.ANTHROPIC_API_KEY:
            self._client = anthropic.AsyncAnthropic(
                api_key=settings.ANTHROPIC_API_KEY,
                timeout=_API_TIMEOUT,
            )
            logger.info("Orchestrator initialised with Claude API (model=%s)", settings.ORCHESTRATOR_MODEL)
        else:
            logger.warning(
                "ANTHROPIC_API_KEY not set — orchestrator will use mock/fallback planning"
            )

    # ── Claude API helpers ───────────────────────────────────────────

    async def _call_claude(
        self,
        system_prompt: str,
        user_message: str,
        *,
        max_tokens: int = 4096,
    ) -> Optional[dict[str, Any]]:
        """Call Claude and parse the JSON response.

        Returns the parsed dict on success, or ``None`` if the call fails for
        any reason (missing client, API error, malformed JSON).
        """
        if self._client is None:
            logger.debug("No Claude client configured — skipping API call")
            return None

        try:
            response = await self._client.messages.create(
                model=settings.ORCHESTRATOR_MODEL,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )

            # Extract text from the response
            raw_text = ""
            for block in response.content:
                if block.type == "text":
                    raw_text += block.text

            if not raw_text.strip():
                logger.error("Claude returned empty response")
                return None

            # Strip markdown code fences if present
            cleaned = raw_text.strip()
            if cleaned.startswith("```"):
                # Remove opening fence (possibly with language tag)
                first_newline = cleaned.index("\n")
                cleaned = cleaned[first_newline + 1 :]
            if cleaned.endswith("```"):
                cleaned = cleaned[: -3]
            cleaned = cleaned.strip()

            parsed = json.loads(cleaned)
            return parsed

        except anthropic.AuthenticationError as exc:
            logger.error("Claude API authentication failed: %s", exc)
            return None
        except anthropic.RateLimitError as exc:
            logger.error("Claude API rate limited: %s", exc)
            return None
        except anthropic.APIConnectionError as exc:
            logger.error("Claude API connection error: %s", exc)
            return None
        except anthropic.APIStatusError as exc:
            logger.error("Claude API error (status %s): %s", exc.status_code, exc)
            return None
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse Claude response as JSON: %s (raw: %s)", exc, raw_text[:500])
            return None
        except Exception as exc:
            logger.exception("Unexpected error calling Claude: %s", exc)
            return None

    async def _audit_llm_call(
        self,
        db: AsyncSession,
        *,
        engagement_id: uuid.UUID,
        prompt_type: str,
        system_prompt: str,
        user_message: str,
        response: Optional[dict[str, Any]],
        used_fallback: bool,
    ) -> None:
        """Log an LLM call to the audit system for transparency."""
        await ActionLogger.log(
            db,
            actor_id=None,
            action=AuditAction.OPERATION_PLANNED,
            resource_type="llm_call",
            resource_id=None,
            details={
                "engagement_id": str(engagement_id),
                "prompt_type": prompt_type,
                "model": settings.ORCHESTRATOR_MODEL if not used_fallback else "mock",
                "system_prompt_length": len(system_prompt),
                "user_message_length": len(user_message),
                "response_received": response is not None,
                "used_fallback": used_fallback,
            },
        )

    # ── Planning ─────────────────────────────────────────────────────

    async def plan_attack_chain(
        self,
        db: AsyncSession,
        engagement_id: uuid.UUID,
    ) -> list[Operation]:
        """Generate a sequence of planned operations for an engagement.

        Calls Claude to analyse the scope and produce a tailored attack plan.
        Falls back to deterministic mock planning if the API is unavailable.
        """
        engagement = await db.get(Engagement, engagement_id)
        if engagement is None:
            raise ValueError(f"Engagement {engagement_id} not found")

        if engagement.status != EngagementStatus.ACTIVE:
            raise ValueError(
                f"Engagement must be ACTIVE to plan operations (current: {engagement.status.value})"
            )

        # Attempt Claude-powered planning
        user_message = build_planner_user_message(
            engagement.scope_config,
            engagement.rules_of_engagement,
        )
        claude_response = await self._call_claude(
            SYSTEM_PROMPT_PLANNER,
            user_message,
            max_tokens=4096,
        )

        await self._audit_llm_call(
            db,
            engagement_id=engagement_id,
            prompt_type="plan_attack_chain",
            system_prompt=SYSTEM_PROMPT_PLANNER,
            user_message=user_message,
            response=claude_response,
            used_fallback=claude_response is None,
        )

        if claude_response is not None:
            # Parse Claude response into chain definitions
            chain_defs = self._parse_plan_response(claude_response)
            if chain_defs:
                return await self._create_operations_from_defs(
                    db, engagement_id, engagement.scope_config, chain_defs
                )
            logger.warning("Claude plan response was empty or invalid — falling back to mock")

        # ── Fallback: deterministic mock planning ────────────────────
        return await self._mock_plan_attack_chain(db, engagement_id, engagement)

    def _parse_plan_response(self, response: Any) -> list[dict]:
        """Safely extract operation definitions from Claude's plan response."""
        # Response should be a list of operation dicts
        ops_list: list[dict] = []

        if isinstance(response, list):
            raw_ops = response
        elif isinstance(response, dict) and "operations" in response:
            raw_ops = response["operations"]
        elif isinstance(response, dict) and "chain" in response:
            raw_ops = response["chain"]
        else:
            logger.warning("Unexpected plan response structure: %s", type(response))
            return []

        for item in raw_ops:
            if not isinstance(item, dict):
                continue
            try:
                tool_domain_str = str(item.get("tool_domain", "")).upper()
                if tool_domain_str not in _TOOL_DOMAIN_MAP:
                    logger.warning("Unknown tool_domain '%s' — skipping operation", tool_domain_str)
                    continue

                ops_list.append({
                    "tool_domain": _TOOL_DOMAIN_MAP[tool_domain_str],
                    "action_type": str(item.get("action_type", "unknown")),
                    "target": str(item.get("target", "")),
                    "parameters": item.get("parameters", {}),
                })
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning("Skipping malformed operation in plan: %s", exc)
                continue

        return ops_list

    async def _create_operations_from_defs(
        self,
        db: AsyncSession,
        engagement_id: uuid.UUID,
        scope_config: dict,
        chain_defs: list[dict],
    ) -> list[Operation]:
        """Persist a list of operation definitions as PLANNED operations."""
        operations: list[Operation] = []
        parent_id: Optional[uuid.UUID] = None

        for defn in chain_defs:
            # Scope check before planning
            target = defn.get("target", "")
            if target and not ScopeValidator.validate_target(target, scope_config):
                logger.warning("Skipping out-of-scope target %s", target)
                continue

            op = Operation(
                engagement_id=engagement_id,
                tool_domain=defn["tool_domain"],
                action_type=defn["action_type"],
                target=target,
                parameters=defn.get("parameters", {}),
                status=OperationStatus.PLANNED,
                parent_operation_id=parent_id,
            )
            db.add(op)
            await db.flush()

            await ActionLogger.log(
                db,
                actor_id=None,
                action=AuditAction.OPERATION_PLANNED,
                resource_type="operation",
                resource_id=op.id,
                details={
                    "action_type": op.action_type,
                    "target": op.target,
                    "tool_domain": op.tool_domain.value,
                    "source": "claude",
                },
            )

            operations.append(op)
            parent_id = op.id

        return operations

    async def _mock_plan_attack_chain(
        self,
        db: AsyncSession,
        engagement_id: uuid.UUID,
        engagement: Engagement,
    ) -> list[Operation]:
        """Deterministic fallback planning when Claude is unavailable."""
        targets = engagement.scope_config.get("allowed_hosts", [])
        primary_target = targets[0] if targets else "10.0.0.0/24"

        chain_defs: list[dict] = [
            {
                "tool_domain": ToolDomain.NETWORK,
                "action_type": "port_scan",
                "target": primary_target,
                "parameters": {"scan_type": "-sV -sC -T4"},
            },
            {
                "tool_domain": ToolDomain.NETWORK,
                "action_type": "dns_enum",
                "target": primary_target,
                "parameters": {},
            },
            {
                "tool_domain": ToolDomain.AD,
                "action_type": "bloodhound_collection",
                "target": primary_target,
                "parameters": {"methods": ["All"]},
            },
            {
                "tool_domain": ToolDomain.NETWORK,
                "action_type": "vuln_scan",
                "target": primary_target,
                "parameters": {"templates": "cves,default-logins,exposed-panels"},
            },
            {
                "tool_domain": ToolDomain.AD,
                "action_type": "credential_spray",
                "target": primary_target,
                "parameters": {"protocol": "smb", "user_count": 100},
            },
            {
                "tool_domain": ToolDomain.NETWORK,
                "action_type": "exploit",
                "target": primary_target,
                "parameters": {"module": "exploit/windows/smb/ms17_010_eternalblue"},
            },
            {
                "tool_domain": ToolDomain.AD,
                "action_type": "credential_dump",
                "target": primary_target,
                "parameters": {"technique": "sekurlsa::logonpasswords"},
            },
            {
                "tool_domain": ToolDomain.NETWORK,
                "action_type": "lateral_movement",
                "target": primary_target,
                "parameters": {"technique": "psexec", "source_host": "pivot-01"},
            },
        ]

        return await self._create_operations_from_defs(
            db, engagement_id, engagement.scope_config, chain_defs
        )

    # ── Execution loop ───────────────────────────────────────────────

    async def execute_next(
        self,
        db: AsyncSession,
        engagement_id: uuid.UUID,
    ) -> Optional[Operation]:
        """Find and execute the next APPROVED operation in the chain.

        Returns the executed operation, or ``None`` if there are none ready.
        """
        if await kill_switch.is_active(engagement_id):
            logger.info("Kill switch active for engagement %s — halting", engagement_id)
            return None

        stmt = (
            select(Operation)
            .where(
                Operation.engagement_id == engagement_id,
                Operation.status == OperationStatus.APPROVED,
            )
            .order_by(Operation.created_at)
            .limit(1)
        )
        result = await db.execute(stmt)
        operation = result.scalar_one_or_none()

        if operation is None:
            return None

        operation = await self.tool_executor.dispatch(db, operation)
        return operation

    # ── Tool output processing ───────────────────────────────────────

    async def process_tool_output(
        self,
        db: AsyncSession,
        operation_id: uuid.UUID,
        output: dict,
    ) -> Operation:
        """Process tool output: store it, ask Claude to analyse, create findings."""
        operation = await db.get(Operation, operation_id)
        if operation is None:
            raise ValueError(f"Operation {operation_id} not found")

        # Store the raw output
        parsed = ToolExecutor.parse_output(output)
        operation.output = parsed
        operation.status = OperationStatus.COMPLETED
        await db.flush()

        # Attempt Claude-powered analysis
        user_message = build_analyzer_user_message(
            tool_domain=operation.tool_domain.value,
            action_type=operation.action_type,
            target=operation.target,
            output=parsed,
        )
        analysis = await self._call_claude(
            SYSTEM_PROMPT_ANALYZER,
            user_message,
            max_tokens=4096,
        )

        await self._audit_llm_call(
            db,
            engagement_id=operation.engagement_id,
            prompt_type="process_tool_output",
            system_prompt=SYSTEM_PROMPT_ANALYZER,
            user_message=user_message,
            response=analysis,
            used_fallback=analysis is None,
        )

        if analysis is not None:
            await self._create_findings_from_analysis(db, operation, analysis)

        return operation

    async def _create_findings_from_analysis(
        self,
        db: AsyncSession,
        operation: Operation,
        analysis: dict[str, Any],
    ) -> list[Finding]:
        """Create Finding records from Claude's tool output analysis."""
        findings_data = analysis.get("findings", [])
        if not isinstance(findings_data, list):
            logger.warning("Analysis 'findings' is not a list: %s", type(findings_data))
            return []

        created: list[Finding] = []
        for item in findings_data:
            if not isinstance(item, dict):
                continue
            try:
                severity_str = str(item.get("severity", "INFO")).upper()
                severity = _SEVERITY_MAP.get(severity_str, FindingSeverity.INFO)

                finding = Finding(
                    engagement_id=operation.engagement_id,
                    operation_id=operation.id,
                    title=str(item.get("title", "Untitled finding"))[:500],
                    description=str(item.get("description", "")),
                    severity=severity,
                    affected_asset=str(item.get("affected_asset", operation.target))[:500] or None,
                    evidence=item.get("evidence") if isinstance(item.get("evidence"), dict) else None,
                )
                db.add(finding)
                await db.flush()

                await ActionLogger.log(
                    db,
                    actor_id=None,
                    action=AuditAction.FINDING_CREATED,
                    resource_type="finding",
                    resource_id=finding.id,
                    details={
                        "title": finding.title,
                        "severity": finding.severity.value,
                        "operation_id": str(operation.id),
                        "source": "claude_analysis",
                    },
                )
                created.append(finding)
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning("Skipping malformed finding in analysis: %s", exc)
                continue

        return created

    # ── Next-step decision ───────────────────────────────────────────

    async def decide_next_step(
        self,
        db: AsyncSession,
        engagement_id: uuid.UUID,
        completed_op: Operation,
    ) -> Optional[Operation]:
        """Decide what to do after an operation completes.

        Calls Claude to analyse the completed operation and all prior results,
        then decides whether to CONTINUE, BRANCH, ESCALATE, or REPORT.
        Falls back to simply promoting the next PLANNED operation if the API
        is unavailable.
        """
        if await kill_switch.is_active(engagement_id):
            return None

        # Fetch engagement for scope config
        engagement = await db.get(Engagement, engagement_id)
        if engagement is None:
            return None

        # Fetch all operations for this engagement
        ops_stmt = (
            select(Operation)
            .where(Operation.engagement_id == engagement_id)
            .order_by(Operation.created_at)
        )
        ops_result = await db.execute(ops_stmt)
        all_operations = list(ops_result.scalars().all())

        # Fetch all findings for this engagement
        findings_stmt = (
            select(Finding)
            .where(Finding.engagement_id == engagement_id)
            .order_by(Finding.created_at)
        )
        findings_result = await db.execute(findings_stmt)
        all_findings = list(findings_result.scalars().all())

        # Build context summaries
        completed_summary = (
            f"Operation: {completed_op.tool_domain.value}/{completed_op.action_type} "
            f"against {completed_op.target}\n"
            f"Status: {completed_op.status.value}\n"
            f"Output: {json.dumps(completed_op.output, default=str)[:2000] if completed_op.output else 'No output'}"
        )

        ops_summary = "\n".join(
            f"- [{op.status.value}] {op.tool_domain.value}/{op.action_type} -> {op.target}"
            for op in all_operations
        )

        findings_summary = "\n".join(
            f"- [{f.severity.value}] {f.title} (asset: {f.affected_asset})"
            for f in all_findings
        ) if all_findings else "No findings yet."

        user_message = build_decision_user_message(
            completed_op_summary=completed_summary,
            all_operations_summary=ops_summary,
            all_findings_summary=findings_summary,
            scope_config=engagement.scope_config,
        )

        decision_response = await self._call_claude(
            SYSTEM_PROMPT_DECISION,
            user_message,
            max_tokens=2048,
        )

        await self._audit_llm_call(
            db,
            engagement_id=engagement_id,
            prompt_type="decide_next_step",
            system_prompt=SYSTEM_PROMPT_DECISION,
            user_message=user_message,
            response=decision_response,
            used_fallback=decision_response is None,
        )

        if decision_response is not None:
            return await self._process_decision_response(
                db, engagement_id, engagement.scope_config, decision_response
            )

        # ── Fallback: promote next PLANNED operation ─────────────────
        return await self._mock_decide_next_step(db, engagement_id)

    async def _process_decision_response(
        self,
        db: AsyncSession,
        engagement_id: uuid.UUID,
        scope_config: dict,
        response: dict[str, Any],
    ) -> Optional[Operation]:
        """Process Claude's decision response and take the appropriate action."""
        decision = str(response.get("decision", "CONTINUE")).upper()
        reasoning = response.get("reasoning", "")

        logger.info(
            "Claude decision for engagement %s: %s — %s",
            engagement_id, decision, reasoning,
        )

        if decision == "REPORT":
            # No more operations needed
            logger.info("Claude recommends REPORT for engagement %s", engagement_id)
            return None

        if decision in ("BRANCH", "ESCALATE"):
            new_ops = response.get("new_operations", [])
            if isinstance(new_ops, list) and new_ops:
                chain_defs = self._parse_plan_response(new_ops)
                if chain_defs:
                    created = await self._create_operations_from_defs(
                        db, engagement_id, scope_config, chain_defs
                    )
                    if created:
                        # Submit the first new operation for approval
                        await ApprovalEngine.create_approval_request(db, created[0])
                        return created[0]

        # CONTINUE or fallback: promote next PLANNED operation
        return await self._mock_decide_next_step(db, engagement_id)

    async def _mock_decide_next_step(
        self,
        db: AsyncSession,
        engagement_id: uuid.UUID,
    ) -> Optional[Operation]:
        """Fallback: simply promote the next PLANNED operation to approval."""
        stmt = (
            select(Operation)
            .where(
                Operation.engagement_id == engagement_id,
                Operation.status == OperationStatus.PLANNED,
            )
            .order_by(Operation.created_at)
            .limit(1)
        )
        result = await db.execute(stmt)
        next_op = result.scalar_one_or_none()

        if next_op is None:
            return None

        await ApprovalEngine.create_approval_request(db, next_op)
        return next_op
