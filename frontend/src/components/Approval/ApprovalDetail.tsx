import React, { useState } from 'react';
import { clsx } from 'clsx';
import {
  Shield,
  Target,
  Server,
  Brain,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Globe,
  Network,
  Database,
  Code2,
} from 'lucide-react';
import { ApprovalRequest, ApprovalTier, ApprovalStatus, ToolDomain } from '../../types';
import { TIER_CONFIG, TOOL_DOMAIN_LABELS } from '../../utils/constants';
import { formatDate, formatTier } from '../../utils/formatters';
import Modal from '../common/Modal';
import Badge from '../common/Badge';

interface ApprovalDetailProps {
  request: ApprovalRequest | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (id: string, notes: string) => void;
  onDeny: (id: string, notes: string) => void;
}

const tierBadgeVariants: Record<ApprovalTier, 'passive' | 'active' | 'exploit' | 'lateral'> = {
  [ApprovalTier.PASSIVE]: 'passive',
  [ApprovalTier.ACTIVE]: 'active',
  [ApprovalTier.EXPLOIT]: 'exploit',
  [ApprovalTier.LATERAL]: 'lateral',
};

const domainIcons: Record<ToolDomain, React.ReactNode> = {
  [ToolDomain.AD]: <Server className="w-4 h-4" />,
  [ToolDomain.CLOUD]: <Globe className="w-4 h-4" />,
  [ToolDomain.NETWORK]: <Network className="w-4 h-4" />,
  [ToolDomain.AI_LLM]: <Brain className="w-4 h-4" />,
};

const ORCHESTRATOR_CONTEXT: Record<string, string> = {
  dns_zone_transfer:
    'Initial reconnaissance identified the target DNS server at ns1.corp.target.local. Zone transfer will expose the internal naming schema and network layout. This is a standard first step in the attack methodology — mapping the internal topology before active scanning. The orchestrator expects to discover hostnames for domain controllers, mail servers, and database instances that will inform subsequent enumeration phases.',
  port_scan:
    'Based on prior DNS reconnaissance, multiple hosts have been identified in the 10.0.50.0/24 subnet. A comprehensive port scan will catalog exposed services (SMB, RDP, SSH, HTTP/S, MSSQL) across the subnet, establishing the attack surface. Results will feed the service-specific enumeration modules. Timing is set to T3 to balance speed with detection avoidance.',
  smb_enumeration:
    'Port scanning revealed SMB (445/tcp) open on the file server. SMB enumeration will extract share listings, user sessions, and potentially writable shares. This information commonly reveals overly permissive file shares containing credentials, configuration files, or sensitive documents. The orchestrator will cross-reference discovered accounts with the domain user list.',
  kerberoasting:
    'Domain enumeration identified 14 service accounts with Service Principal Names registered. Kerberoasting will request TGS tickets for these SPNs using the compromised domain user credentials. Offline cracking of the extracted ticket hashes may yield plaintext passwords for service accounts, which often have elevated privileges. This is a high-value, low-noise attack path.',
  as_rep_roasting:
    'LDAP enumeration revealed 3 accounts with "Do not require Kerberos preauthentication" set. AS-REP roasting will request AS-REP responses for these accounts without needing valid credentials. The extracted hashes can be cracked offline. This technique generates minimal log artifacts compared to password spraying.',
  sql_injection:
    'Web application scanning identified a potential SQL injection point at /api/v2/search?q= on the internal portal. Manual confirmation and exploitation will attempt to extract database schema, user credentials, and establish the extent of data access. The web application is running on MSSQL backend with potential xp_cmdshell availability.',
  psexec_lateral:
    'The compromised service account (svc_backup) has local admin privileges on DC01.corp.target.local as confirmed via bloodhound path analysis. PsExec lateral movement will establish a SYSTEM-level session on the domain controller. This represents the culmination of the current attack chain — from initial access through privilege escalation to domain dominance. Requires senior approval due to criticality.',
  cloud_enum:
    'Azure AD sync was detected during domain enumeration. Cloud resource enumeration will map the Azure tenant, identify storage accounts, and check for misconfigured IAM roles or overly permissive service principals. Hybrid environments frequently have sync misconfigurations that expose on-prem credentials in cloud metadata.',
  llm_prompt_inject:
    'The internal AI assistant (chat.corp.target.local) was identified during web enumeration. Prompt injection testing will attempt to bypass system prompts and extract training data, system configurations, or API keys embedded in the model context. This tests a novel attack surface increasingly present in enterprise environments.',
  password_spray:
    'Enumeration identified 847 domain user accounts. Password spraying with seasonal/common passwords (e.g., Autumn2026!, Corp@2026) will test for weak credentials across the user base. The spray is throttled to 1 attempt per account per 35 minutes to stay under the default lockout threshold of 5 attempts in 30 minutes.',
};

const MOCK_EVIDENCE: Record<string, Array<{ type: string; label: string; value: string }>> = {
  dns_zone_transfer: [
    { type: 'discovery', label: 'DNS Server Identified', value: 'ns1.corp.target.local (10.0.50.2)' },
    { type: 'scan', label: 'Port 53/tcp', value: 'Open — ISC BIND 9.16.1' },
    { type: 'config', label: 'Transfer Policy', value: 'Zone transfer not restricted (AXFR allowed)' },
  ],
  port_scan: [
    { type: 'recon', label: 'Subnet Identified', value: '10.0.50.0/24 — 254 hosts' },
    { type: 'discovery', label: 'Prior DNS Results', value: '23 hostnames resolved in target subnet' },
    { type: 'config', label: 'Scan Profile', value: 'SYN scan, top 1000 ports, T3 timing' },
  ],
  smb_enumeration: [
    { type: 'scan', label: 'Port 445/tcp Open', value: 'FILE01.corp.target.local (10.0.50.15)' },
    { type: 'discovery', label: 'OS Detection', value: 'Windows Server 2019 — SMBv3' },
    { type: 'config', label: 'Signing Required', value: 'No — potential relay target' },
  ],
  kerberoasting: [
    { type: 'recon', label: 'SPN Accounts Found', value: '14 service accounts with registered SPNs' },
    { type: 'credential', label: 'Domain User', value: 'j.smith@corp.target.local (compromised)' },
    { type: 'discovery', label: 'High-Value Targets', value: 'svc_backup, svc_sql, svc_exchange' },
  ],
  as_rep_roasting: [
    { type: 'recon', label: 'Vulnerable Accounts', value: '3 accounts with no pre-auth requirement' },
    { type: 'discovery', label: 'Accounts', value: 'legacy_admin, svc_scanner, temp_contractor' },
    { type: 'config', label: 'Encryption Type', value: 'RC4_HMAC_MD5 (crackable)' },
  ],
  sql_injection: [
    { type: 'scan', label: 'Endpoint', value: 'POST /api/v2/search — parameter: q' },
    { type: 'discovery', label: 'Error Disclosure', value: 'MSSQL error in response body (verbose)' },
    { type: 'config', label: 'WAF Status', value: 'No WAF detected on internal portal' },
  ],
  psexec_lateral: [
    { type: 'credential', label: 'Compromised Account', value: 'svc_backup — NTLM hash obtained' },
    { type: 'recon', label: 'BloodHound Path', value: 'svc_backup → Local Admin → DC01' },
    { type: 'discovery', label: 'Target', value: 'DC01.corp.target.local (10.0.50.5)' },
  ],
  cloud_enum: [
    { type: 'discovery', label: 'Azure AD Connect', value: 'Sync detected — hybrid identity' },
    { type: 'recon', label: 'Tenant ID', value: 'a3b2c1d0-e5f6-4a3b-8c9d-1234567890ab' },
    { type: 'config', label: 'Sync Method', value: 'Password Hash Sync (PHS) enabled' },
  ],
  llm_prompt_inject: [
    { type: 'discovery', label: 'AI Endpoint', value: 'chat.corp.target.local/api/chat' },
    { type: 'scan', label: 'Model', value: 'GPT-4 fine-tuned — internal knowledge base' },
    { type: 'config', label: 'Auth Required', value: 'SSO — accessible with domain credentials' },
  ],
  password_spray: [
    { type: 'recon', label: 'User Accounts', value: '847 domain users enumerated via LDAP' },
    { type: 'config', label: 'Lockout Policy', value: '5 attempts / 30 min lockout window' },
    { type: 'discovery', label: 'Password Policy', value: 'Min 8 chars, complexity enabled, 90-day expiry' },
  ],
};

function getContext(actionType: string): string {
  const key = actionType.toLowerCase().replace(/[\s-]/g, '_');
  return (
    ORCHESTRATOR_CONTEXT[key] ||
    `The orchestrator selected ${actionType.replace(/_/g, ' ')} as the next logical step based on intelligence gathered in prior phases. This action extends the current attack chain by leveraging previously discovered assets and credentials to further enumerate or compromise the target environment.`
  );
}

function getEvidence(actionType: string): Array<{ type: string; label: string; value: string }> {
  const key = actionType.toLowerCase().replace(/[\s-]/g, '_');
  return (
    MOCK_EVIDENCE[key] || [
      { type: 'discovery', label: 'Prior Intelligence', value: 'Target identified during reconnaissance phase' },
      { type: 'scan', label: 'Service Detected', value: 'Target service confirmed accessible' },
      { type: 'config', label: 'Attack Profile', value: 'Default tool configuration applied' },
    ]
  );
}

const evidenceTypeIcons: Record<string, React.ReactNode> = {
  discovery: <Target className="w-3.5 h-3.5 text-indigo-400" />,
  scan: <Network className="w-3.5 h-3.5 text-blue-400" />,
  recon: <Globe className="w-3.5 h-3.5 text-cyan-400" />,
  config: <Code2 className="w-3.5 h-3.5 text-slate-400" />,
  credential: <Shield className="w-3.5 h-3.5 text-amber-400" />,
};

export const ApprovalDetail: React.FC<ApprovalDetailProps> = ({
  request,
  isOpen,
  onClose,
  onApprove,
  onDeny,
}) => {
  const [notes, setNotes] = useState('');

  if (!request) return null;

  const tierConfig = TIER_CONFIG[request.tier];
  const domainLabel = TOOL_DOMAIN_LABELS[request.operation.tool_domain] || request.operation.tool_domain;
  const isPending = request.status === ApprovalStatus.PENDING;
  const context = getContext(request.operation.action_type);
  const evidence = getEvidence(request.operation.action_type);

  const handleApprove = () => {
    onApprove(request.id, notes);
    setNotes('');
  };

  const handleDeny = () => {
    onDeny(request.id, notes);
    setNotes('');
  };

  const footer = isPending ? (
    <>
      <button
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-lg border border-slate-600 hover:bg-slate-700 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={handleDeny}
        className={clsx(
          'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
          'bg-red-500/10 text-red-400 border border-red-500/30',
          'hover:bg-red-500/20 hover:border-red-500/50'
        )}
      >
        <XCircle className="w-4 h-4" />
        Deny
      </button>
      <button
        onClick={handleApprove}
        className={clsx(
          'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
          'bg-green-500/10 text-green-400 border border-green-500/30',
          'hover:bg-green-500/20 hover:border-green-500/50'
        )}
      >
        <CheckCircle2 className="w-4 h-4" />
        Approve
      </button>
    </>
  ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={request.operation.action_type.replace(/_/g, ' ')}
      size="xl"
      footer={footer}
    >
      <div className="space-y-6">
        {/* Operation Details */}
        <section>
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            Operation Details
          </h3>
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-xs text-slate-500 mb-1">Action Type</span>
                <span className="text-sm text-slate-200 font-medium">
                  {request.operation.action_type.replace(/_/g, ' ')}
                </span>
              </div>
              <div>
                <span className="block text-xs text-slate-500 mb-1">Tool Domain</span>
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-200">
                  {domainIcons[request.operation.tool_domain]}
                  {domainLabel}
                </span>
              </div>
              <div>
                <span className="block text-xs text-slate-500 mb-1">Operation ID</span>
                <span className="text-sm text-slate-400 font-mono">{request.operation.id}</span>
              </div>
              <div>
                <span className="block text-xs text-slate-500 mb-1">Created</span>
                <span className="text-sm text-slate-400">{formatDate(request.created_at)}</span>
              </div>
              <div>
                <span className="block text-xs text-slate-500 mb-1">Approval Tier</span>
                <Badge variant={tierBadgeVariants[request.tier]} size="sm">
                  {tierConfig.label}
                </Badge>
              </div>
              <div>
                <span className="block text-xs text-slate-500 mb-1">Status</span>
                <span className={clsx(
                  'text-sm font-medium',
                  request.status === ApprovalStatus.PENDING ? 'text-yellow-400' :
                  request.status === ApprovalStatus.APPROVED || request.status === ApprovalStatus.AUTO_APPROVED ? 'text-green-400' :
                  request.status === ApprovalStatus.DENIED ? 'text-red-400' : 'text-slate-400'
                )}>
                  {request.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Target Info */}
        <section>
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-400" />
            Target Information
          </h3>
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Server className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">{request.operation.target}</p>
                <p className="text-xs text-slate-500">
                  Engagement: {request.operation.engagement_id}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Parameters */}
        <section>
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-indigo-400" />
            Parameters
          </h3>
          <div className="bg-slate-950 rounded-lg border border-slate-700 p-4">
            <pre className="text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(request.operation.parameters, null, 2)}
            </pre>
          </div>
        </section>

        {/* Orchestrator Reasoning */}
        <section>
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-400" />
            Orchestrator Reasoning
          </h3>
          <div className="bg-indigo-500/5 rounded-lg border border-indigo-500/20 p-4">
            <p className="text-sm text-slate-300 leading-relaxed">{context}</p>
          </div>
        </section>

        {/* Evidence */}
        <section>
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            Supporting Evidence
          </h3>
          <div className="space-y-2">
            {evidence.map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3 bg-slate-800/50 rounded-lg border border-slate-700 p-3"
              >
                <div className="mt-0.5 shrink-0">
                  {evidenceTypeIcons[item.type] || <Info className="w-3.5 h-3.5 text-slate-400" />}
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-slate-400">{item.label}</span>
                  <span className="block text-sm text-slate-200 mt-0.5">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tier Explanation */}
        <section>
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-indigo-400" />
            Tier Classification
          </h3>
          <div className={clsx('rounded-lg border p-4', tierConfig.bgColor, tierConfig.borderColor)}>
            <div className="flex items-center gap-2 mb-2">
              <Shield className={clsx('w-4 h-4', tierConfig.color)} />
              <span className={clsx('text-sm font-semibold', tierConfig.color)}>
                {tierConfig.label}
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{tierConfig.description}</p>
          </div>
        </section>

        {/* Reviewer Notes */}
        {isPending && (
          <section>
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              Reviewer Notes
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes for the approval decision (optional)..."
              rows={3}
              className={clsx(
                'w-full rounded-lg border bg-slate-800/50 border-slate-700 px-4 py-3 text-sm text-slate-200',
                'placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50',
                'resize-none transition-colors'
              )}
            />
          </section>
        )}

        {/* Previous Decision Notes */}
        {!isPending && request.decision_notes && (
          <section>
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              Decision Notes
            </h3>
            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
              <p className="text-sm text-slate-300">{request.decision_notes}</p>
              {request.reviewer_id && (
                <p className="mt-2 text-xs text-slate-500">Reviewed by: {request.reviewer_id}</p>
              )}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
};

export default ApprovalDetail;
