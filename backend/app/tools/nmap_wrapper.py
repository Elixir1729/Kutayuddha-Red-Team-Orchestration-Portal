"""Wrapper around the *nmap* CLI for network scanning."""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import xml.etree.ElementTree as ET
from typing import Any

from app.models.base import ToolDomain
from app.tools.base import ToolResult, ToolWrapper

logger = logging.getLogger(__name__)

# Action types this wrapper handles.
SUPPORTED_ACTIONS = {"port_scan", "service_enum", "vuln_scan"}

# Default timeout for an nmap run (seconds).
DEFAULT_TIMEOUT = 300

# IP / CIDR pattern used for quick target validation.
_IP_OR_CIDR_RE = re.compile(
    r"^(?:\d{1,3}\.){3}\d{1,3}(?:/\d{1,2})?$"
)


class NmapWrapper(ToolWrapper):
    """Executes *nmap* scans and returns structured results."""

    name: str = "nmap"
    domain: ToolDomain = ToolDomain.NETWORK

    def __init__(self, timeout: int = DEFAULT_TIMEOUT) -> None:
        self.timeout = timeout

    # ── Validation ────────────────────────────────────────────────────

    async def validate_params(self, parameters: dict) -> bool:
        """Validate that mandatory parameters are present and sensible."""
        target = parameters.get("target", "")
        if not target:
            raise ValueError("'target' parameter is required")
        self._validate_target(target)

        action = parameters.get("action_type", "port_scan")
        if action not in SUPPORTED_ACTIONS:
            raise ValueError(
                f"Unsupported action_type '{action}'. "
                f"Supported: {', '.join(sorted(SUPPORTED_ACTIONS))}"
            )
        return True

    @staticmethod
    def _validate_target(target: str) -> None:
        """Ensure *target* is an IP address or CIDR range."""
        # Allow hostnames that look like FQDNs as well, but reject
        # anything that looks like a URL or obviously nonsensical.
        if target.startswith(("http://", "https://", "ftp://")):
            raise ValueError(
                f"Target must be an IP address, CIDR range, or hostname — not a URL: {target}"
            )

        # Try parsing as an IP or network first.
        try:
            ipaddress.ip_address(target)
            return
        except ValueError:
            pass
        try:
            ipaddress.ip_network(target, strict=False)
            return
        except ValueError:
            pass

        # Accept hostnames (simple heuristic: alphanums, dots, hyphens).
        if re.match(r"^[a-zA-Z0-9._-]+$", target):
            return

        raise ValueError(
            f"Target must be an IP, CIDR range, or hostname: {target}"
        )

    # ── Execution ─────────────────────────────────────────────────────

    async def execute(self, target: str, parameters: dict) -> ToolResult:
        """Run *nmap* against *target* and return parsed results."""
        if not self.binary_available("nmap"):
            return ToolResult(
                success=False,
                raw_output="",
                error="nmap is not installed or not found on $PATH. "
                      "Install it with: apt-get install nmap",
            )

        # Validate inputs.
        merged = {**parameters, "target": target}
        await self.validate_params(merged)

        action = parameters.get("action_type", "port_scan")
        timeout = parameters.get("timeout", self.timeout)

        cmd = self._build_command(action, target, parameters)
        logger.info("Executing nmap: %s (timeout=%ds)", " ".join(cmd), timeout)

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
            # Try to kill the timed-out process.
            try:
                proc.kill()  # type: ignore[union-attr]
            except ProcessLookupError:
                pass
            return ToolResult(
                success=False,
                raw_output="",
                error=f"nmap timed out after {timeout} seconds",
            )
        except OSError as exc:
            return ToolResult(
                success=False,
                raw_output="",
                error=f"Failed to start nmap process: {exc}",
            )

        raw_stdout = stdout_bytes.decode("utf-8", errors="replace")
        raw_stderr = stderr_bytes.decode("utf-8", errors="replace")

        if proc.returncode != 0:
            return ToolResult(
                success=False,
                raw_output=raw_stdout,
                error=f"nmap exited with code {proc.returncode}: {raw_stderr.strip()}",
            )

        # Parse XML output.
        try:
            parsed = await self.parse_output(raw_stdout)
        except Exception as exc:
            return ToolResult(
                success=False,
                raw_output=raw_stdout,
                error=f"Failed to parse nmap XML output: {exc}",
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
    def _build_command(action: str, target: str, parameters: dict) -> list[str]:
        """Build the nmap CLI command list for the given *action*."""
        base = ["nmap"]

        if action == "port_scan":
            base += ["-sS", "-T4", "-oX", "-"]
        elif action == "service_enum":
            base += ["-sV", "-sC", "-oX", "-"]
        elif action == "vuln_scan":
            base += ["--script", "vuln", "-oX", "-"]
        else:
            # Fallback — should never reach here after validation.
            base += ["-oX", "-"]

        # Allow callers to specify extra ports.
        ports = parameters.get("ports")
        if ports:
            base += ["-p", str(ports)]

        base.append(target)
        return base

    # ── Output parsing ────────────────────────────────────────────────

    async def parse_output(self, raw_output: str) -> dict:
        """Parse nmap XML output into a structured dict."""
        root = ET.fromstring(raw_output)
        hosts: list[dict[str, Any]] = []

        for host_el in root.findall("host"):
            host_info = self._parse_host(host_el)
            hosts.append(host_info)

        return {"hosts": hosts}

    @staticmethod
    def _parse_host(host_el: ET.Element) -> dict[str, Any]:
        """Extract structured data from a single <host> element."""
        # IP address
        addr_el = host_el.find("address[@addrtype='ipv4']")
        ip = addr_el.get("addr", "unknown") if addr_el is not None else "unknown"

        # Hostname
        hostname = ""
        hostnames_el = host_el.find("hostnames")
        if hostnames_el is not None:
            hn = hostnames_el.find("hostname")
            if hn is not None:
                hostname = hn.get("name", "")

        # OS detection
        os_info: list[str] = []
        os_el = host_el.find("os")
        if os_el is not None:
            for osmatch in os_el.findall("osmatch"):
                os_info.append(osmatch.get("name", ""))

        # Ports
        ports: list[dict[str, Any]] = []
        ports_el = host_el.find("ports")
        if ports_el is not None:
            for port_el in ports_el.findall("port"):
                port_info = _parse_port(port_el)
                ports.append(port_info)

        return {
            "ip": ip,
            "hostname": hostname,
            "os": os_info,
            "ports": ports,
        }

    # ── Finding generation ────────────────────────────────────────────

    @staticmethod
    def _generate_findings(parsed: dict) -> list[dict]:
        """Auto-generate findings from parsed nmap output."""
        findings: list[dict] = []

        for host in parsed.get("hosts", []):
            ip = host.get("ip", "unknown")
            for port_info in host.get("ports", []):
                if port_info.get("state") != "open":
                    continue

                port = port_info.get("port")
                protocol = port_info.get("protocol", "tcp")
                service = port_info.get("service", "unknown")
                version = port_info.get("version", "")

                title = f"Open port {port}/{protocol}"
                if service != "unknown":
                    title += f" running {service}"
                if version:
                    title += f" {version}"

                severity = "INFO"
                description = (
                    f"Port {port}/{protocol} is open on {ip} "
                    f"running {service} {version}".strip()
                )

                # Heuristic severity bumps.
                if _is_known_risky_service(service, port):
                    severity = "MEDIUM"
                    description += " — commonly targeted service"

                # Script output may contain vulnerability info.
                for script in port_info.get("scripts", []):
                    script_id = script.get("id", "")
                    if "vuln" in script_id.lower() or "VULNERABLE" in script.get("output", ""):
                        severity = "HIGH"
                        description += f" — vulnerability detected by script {script_id}"
                        break

                findings.append(
                    {
                        "title": title,
                        "description": description,
                        "severity": severity,
                        "affected_asset": f"{ip}:{port}/{protocol}",
                    }
                )

        return findings


# ── Module-private helpers ────────────────────────────────────────────


def _parse_port(port_el: ET.Element) -> dict[str, Any]:
    """Parse a single <port> element into a dict."""
    port_id = int(port_el.get("portid", 0))
    protocol = port_el.get("protocol", "tcp")

    state_el = port_el.find("state")
    state = state_el.get("state", "unknown") if state_el is not None else "unknown"

    svc_el = port_el.find("service")
    service = svc_el.get("name", "unknown") if svc_el is not None else "unknown"
    product = svc_el.get("product", "") if svc_el is not None else ""
    version = svc_el.get("version", "") if svc_el is not None else ""
    extra = svc_el.get("extrainfo", "") if svc_el is not None else ""

    # Combine product + version for a human-readable version string.
    version_str = " ".join(filter(None, [product, version, extra])).strip()

    # Collect script output.
    scripts: list[dict[str, str]] = []
    for script_el in port_el.findall("script"):
        scripts.append(
            {
                "id": script_el.get("id", ""),
                "output": script_el.get("output", ""),
            }
        )

    return {
        "port": port_id,
        "protocol": protocol,
        "state": state,
        "service": service,
        "version": version_str,
        "scripts": scripts,
    }


def _is_known_risky_service(service: str, port: int) -> bool:
    """Return True for services / ports commonly targeted in red-team ops."""
    risky_services = {
        "ftp", "telnet", "smb", "ms-sql-s", "mysql", "oracle",
        "rdp", "vnc", "snmp", "ldap", "rpcbind", "nfs",
        "microsoft-ds",
    }
    risky_ports = {21, 23, 445, 1433, 3306, 1521, 3389, 5900, 161, 389, 111, 2049}

    return service.lower() in risky_services or port in risky_ports
