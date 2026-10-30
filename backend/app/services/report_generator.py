"""Report generator — builds structured engagement reports."""

import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import FindingSeverity, OperationStatus
from app.models.engagement import Engagement
from app.models.finding import Finding
from app.models.operation import Operation


class ReportGenerator:
    """Generates structured reports for completed (or in-progress) engagements."""

    @staticmethod
    async def generate_report(
        db: AsyncSession,
        engagement_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Build a full engagement report.

        Returns a dict with:
        - executive_summary
        - findings_by_severity
        - attack_chain_narrative
        - recommendations
        - metadata
        """
        engagement = await db.get(Engagement, engagement_id)
        if engagement is None:
            raise ValueError(f"Engagement {engagement_id} not found")

        # ── Fetch operations ──────────────────────────────────────────
        ops_result = await db.execute(
            select(Operation)
            .where(Operation.engagement_id == engagement_id)
            .order_by(Operation.created_at)
        )
        operations = list(ops_result.scalars().all())

        # ── Fetch findings ────────────────────────────────────────────
        findings_result = await db.execute(
            select(Finding)
            .where(Finding.engagement_id == engagement_id)
            .order_by(Finding.severity.desc(), Finding.created_at)
        )
        findings = list(findings_result.scalars().all())

        # ── Findings by severity ──────────────────────────────────────
        severity_counts: dict[str, int] = Counter()
        findings_grouped: dict[str, list[dict[str, Any]]] = {}
        for f in findings:
            sev = f.severity.value
            severity_counts[sev] += 1
            findings_grouped.setdefault(sev, []).append({
                "id": str(f.id),
                "title": f.title,
                "description": f.description,
                "severity": sev,
                "cvss_score": f.cvss_score,
                "affected_asset": f.affected_asset,
                "evidence": f.evidence,
            })

        # ── Attack chain narrative ────────────────────────────────────
        chain_steps: list[dict[str, Any]] = []
        for op in operations:
            chain_steps.append({
                "id": str(op.id),
                "action": op.action_type,
                "domain": op.tool_domain.value,
                "target": op.target,
                "status": op.status.value,
                "parent_id": str(op.parent_operation_id) if op.parent_operation_id else None,
                "output_summary": _summarise_output(op.output),
            })

        # ── Operation statistics ──────────────────────────────────────
        op_status_counts: dict[str, int] = Counter(op.status.value for op in operations)

        # ── Executive summary ─────────────────────────────────────────
        total_findings = len(findings)
        critical_high = severity_counts.get("CRITICAL", 0) + severity_counts.get("HIGH", 0)
        completed_ops = op_status_counts.get(OperationStatus.COMPLETED.value, 0)
        failed_ops = op_status_counts.get(OperationStatus.FAILED.value, 0)

        executive_summary = (
            f"Engagement '{engagement.name}' executed {len(operations)} operations "
            f"({completed_ops} completed, {failed_ops} failed). "
            f"Discovered {total_findings} findings, of which {critical_high} are "
            f"CRITICAL or HIGH severity. "
        )
        if critical_high > 0:
            executive_summary += (
                "Immediate remediation is recommended for all critical and "
                "high-severity findings."
            )
        else:
            executive_summary += (
                "No critical or high-severity findings were identified. "
                "Review medium and low findings for hardening opportunities."
            )

        # ── Recommendations ───────────────────────────────────────────
        recommendations = _generate_recommendations(findings, operations)

        return {
            "metadata": {
                "engagement_id": str(engagement_id),
                "engagement_name": engagement.name,
                "status": engagement.status.value,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "scope_config": engagement.scope_config,
                "rules_of_engagement": engagement.rules_of_engagement,
                "start_date": engagement.start_date.isoformat() if engagement.start_date else None,
                "end_date": engagement.end_date.isoformat() if engagement.end_date else None,
            },
            "executive_summary": executive_summary,
            "findings_by_severity": findings_grouped,
            "finding_counts": dict(severity_counts),
            "attack_chain_narrative": chain_steps,
            "operation_statistics": dict(op_status_counts),
            "recommendations": recommendations,
        }


def _summarise_output(output: dict | None) -> str:
    """One-line summary of an operation's output."""
    if not output:
        return "No output recorded"
    data = output.get("data", {})
    if "error" in output:
        return f"Error: {output['error']}"
    if "message" in data:
        return data["message"]
    # Try to give a useful short summary
    parts: list[str] = []
    for key, value in data.items():
        if isinstance(value, (int, float, str, bool)):
            parts.append(f"{key}={value}")
    return ", ".join(parts[:5]) if parts else "Completed"


def _generate_recommendations(
    findings: list[Finding],
    operations: list[Operation],
) -> list[dict[str, str]]:
    """Generate actionable recommendations based on findings."""
    recommendations: list[dict[str, str]] = []

    severity_set = {f.severity for f in findings}

    if FindingSeverity.CRITICAL in severity_set:
        recommendations.append({
            "priority": "IMMEDIATE",
            "title": "Address critical vulnerabilities",
            "description": (
                "Critical-severity findings were identified that could lead to "
                "full system compromise. Patch or mitigate immediately."
            ),
        })

    if FindingSeverity.HIGH in severity_set:
        recommendations.append({
            "priority": "HIGH",
            "title": "Remediate high-severity findings",
            "description": (
                "High-severity findings indicate significant exploitable weaknesses. "
                "Schedule remediation within the next sprint cycle."
            ),
        })

    # Check for credential issues
    cred_ops = [
        op for op in operations
        if op.action_type in ("credential_spray", "credential_dump")
        and op.status == OperationStatus.COMPLETED
    ]
    if cred_ops:
        recommendations.append({
            "priority": "HIGH",
            "title": "Strengthen credential policies",
            "description": (
                "Credential attacks were successful. Enforce MFA, increase "
                "password complexity requirements, and implement account lockout policies."
            ),
        })

    # Check for lateral movement success
    lateral_ops = [
        op for op in operations
        if op.action_type == "lateral_movement"
        and op.status == OperationStatus.COMPLETED
    ]
    if lateral_ops:
        recommendations.append({
            "priority": "HIGH",
            "title": "Improve network segmentation",
            "description": (
                "Lateral movement was achievable across network segments. "
                "Review and tighten firewall rules, implement micro-segmentation."
            ),
        })

    if not recommendations:
        recommendations.append({
            "priority": "LOW",
            "title": "Continue monitoring",
            "description": (
                "No critical weaknesses were identified. Maintain current security "
                "posture and schedule periodic re-assessments."
            ),
        })

    return recommendations
