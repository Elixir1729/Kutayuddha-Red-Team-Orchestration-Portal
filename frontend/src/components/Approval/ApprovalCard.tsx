import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Clock, CheckCircle2, XCircle, Shield, Timer, Target, Brain, Loader2 } from 'lucide-react';
import { ApprovalRequest, ApprovalTier, ApprovalStatus } from '../../types';
import { TIER_CONFIG, TOOL_DOMAIN_LABELS } from '../../utils/constants';
import { formatRelativeTime, formatCountdown } from '../../utils/formatters';
import Badge from '../common/Badge';
import api from '../../services/api';

interface ApprovalCardProps {
  request: ApprovalRequest;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onClick: (request: ApprovalRequest) => void;
}

const tierBorderColors: Record<ApprovalTier, string> = {
  [ApprovalTier.PASSIVE]: 'border-l-emerald-500',
  [ApprovalTier.ACTIVE]: 'border-l-amber-500',
  [ApprovalTier.EXPLOIT]: 'border-l-orange-500',
  [ApprovalTier.LATERAL]: 'border-l-red-500',
};

const tierBadgeVariants: Record<ApprovalTier, 'passive' | 'active' | 'exploit' | 'lateral'> = {
  [ApprovalTier.PASSIVE]: 'passive',
  [ApprovalTier.ACTIVE]: 'active',
  [ApprovalTier.EXPLOIT]: 'exploit',
  [ApprovalTier.LATERAL]: 'lateral',
};

const ORCHESTRATOR_REASONING: Record<string, string> = {
  dns_zone_transfer: 'DNS zone transfer will reveal internal naming conventions and network topology, enabling targeted reconnaissance of high-value assets.',
  port_scan: 'Port scanning the target subnet will identify exposed services and potential entry points for further enumeration.',
  smb_enumeration: 'SMB enumeration may reveal shared resources, user accounts, and domain trust relationships useful for privilege mapping.',
  kerberoasting: 'Kerberoasting targets service accounts with SPNs to extract TGS tickets for offline cracking, a common path to credential escalation.',
  as_rep_roasting: 'AS-REP roasting identifies accounts without pre-authentication, allowing offline password attacks without triggering lockout.',
  sql_injection: 'SQL injection on the identified endpoint can yield database access, potentially exposing credentials and sensitive data stores.',
  psexec_lateral: 'PsExec lateral movement to the domain controller using compromised credentials will establish persistent access to the AD infrastructure.',
  cloud_enum: 'Cloud resource enumeration will map the Azure tenant structure and identify misconfigured storage accounts or overly permissive IAM roles.',
  llm_prompt_inject: 'LLM prompt injection testing on the internal AI assistant may reveal data exfiltration paths through the model context window.',
  password_spray: 'Password spraying against the identified accounts uses commonly reused credentials to gain initial access without triggering lockout thresholds.',
};

function getReasoningForAction(actionType: string): string {
  const key = actionType.toLowerCase().replace(/[\s-]/g, '_');
  return ORCHESTRATOR_REASONING[key] || `The orchestrator determined that ${actionType.replace(/_/g, ' ')} on this target is a logical next step in the attack chain based on prior reconnaissance findings.`;
}

const statusConfig: Record<ApprovalStatus, { label: string; className: string }> = {
  [ApprovalStatus.PENDING]: { label: 'Pending Review', className: 'text-yellow-400' },
  [ApprovalStatus.APPROVED]: { label: 'Approved', className: 'text-green-400' },
  [ApprovalStatus.DENIED]: { label: 'Denied', className: 'text-red-400' },
  [ApprovalStatus.AUTO_APPROVED]: { label: 'Auto-Approved', className: 'text-emerald-400' },
  [ApprovalStatus.EXPIRED]: { label: 'Expired', className: 'text-slate-400' },
};

export const ApprovalCard: React.FC<ApprovalCardProps> = ({ request, onApprove, onDeny, onClick }) => {
  const [countdown, setCountdown] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<'approve' | 'deny' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const tierConfig = TIER_CONFIG[request.tier];
  const isPending = request.status === ApprovalStatus.PENDING;
  const hasAutoApprove = request.tier === ApprovalTier.ACTIVE && request.auto_approve_at && isPending;

  useEffect(() => {
    if (!hasAutoApprove || !request.auto_approve_at) return;

    const updateCountdown = () => {
      setCountdown(formatCountdown(request.auto_approve_at!));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [hasAutoApprove, request.auto_approve_at]);

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading('approve');
    setActionError(null);
    try {
      await api.approveRequest(request.id);
      onApprove(request.id);
    } catch (err: any) {
      console.error('Failed to approve:', err);
      setActionError(err.message || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeny = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading('deny');
    setActionError(null);
    try {
      await api.denyRequest(request.id);
      onDeny(request.id);
    } catch (err: any) {
      console.error('Failed to deny:', err);
      setActionError(err.message || 'Failed to deny');
    } finally {
      setActionLoading(null);
    }
  };

  const domainLabel = TOOL_DOMAIN_LABELS[request.operation.tool_domain] || request.operation.tool_domain;
  const statusInfo = statusConfig[request.status];
  const reasoning = getReasoningForAction(request.operation.action_type);

  return (
    <div
      onClick={() => onClick(request)}
      className={clsx(
        'group relative bg-slate-900 rounded-lg border border-slate-700 border-l-4 cursor-pointer',
        'transition-all duration-200 hover:bg-slate-800 hover:border-slate-600 hover:shadow-lg hover:shadow-black/20',
        tierBorderColors[request.tier]
      )}
    >
      <div className="p-4">
        {/* Header row: title + badges */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-100 truncate">
              {request.operation.action_type.replace(/_/g, ' ')}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400 truncate flex items-center gap-1">
              <Target className="w-3 h-3 shrink-0" />
              {request.operation.target}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="info" size="sm">{domainLabel}</Badge>
            <Badge variant={tierBadgeVariants[request.tier]} size="sm">
              {tierConfig.label}
            </Badge>
          </div>
        </div>

        {/* Orchestrator reasoning */}
        <div className="mb-3 flex items-start gap-2 text-xs text-slate-400">
          <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-400" />
          <p className="line-clamp-2 leading-relaxed">{reasoning}</p>
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', statusInfo.className)}>
              <span className={clsx(
                'w-1.5 h-1.5 rounded-full',
                request.status === ApprovalStatus.PENDING ? 'bg-yellow-400 animate-pulse' :
                request.status === ApprovalStatus.APPROVED || request.status === ApprovalStatus.AUTO_APPROVED ? 'bg-green-400' :
                request.status === ApprovalStatus.DENIED ? 'bg-red-400' : 'bg-slate-400'
              )} />
              {statusInfo.label}
            </span>

            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(request.created_at)}
            </span>
          </div>

          {/* Auto-approve countdown for Tier 1 */}
          {hasAutoApprove && countdown !== 'Expired' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
              <Timer className="w-3 h-3" />
              Auto-approve in {countdown}
            </span>
          )}
        </div>

        {/* Action error */}
        {actionError && (
          <div className="mt-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
            {actionError}
          </div>
        )}

        {/* Action buttons */}
        {isPending && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/50">
            <button
              onClick={handleApprove}
              disabled={actionLoading !== null}
              className={clsx(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                'bg-green-500/10 text-green-400 border border-green-500/20',
                actionLoading !== null
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-green-500/20 hover:border-green-500/40'
              )}
            >
              {actionLoading === 'approve' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
            </button>
            <button
              onClick={handleDeny}
              disabled={actionLoading !== null}
              className={clsx(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                'bg-red-500/10 text-red-400 border border-red-500/20',
                actionLoading !== null
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-red-500/20 hover:border-red-500/40'
              )}
            >
              {actionLoading === 'deny' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              {actionLoading === 'deny' ? 'Denying...' : 'Deny'}
            </button>
          </div>
        )}

        {/* Decided state info */}
        {!isPending && request.reviewer_id && (
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <p className="text-xs text-slate-500">
              <span className="text-slate-400">Reviewed by:</span>{' '}
              {request.reviewer_id}
              {request.decision_notes && (
                <span className="ml-2 text-slate-500">— {request.decision_notes}</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Tier indicator glow on hover */}
      <div className={clsx(
        'absolute inset-y-0 left-0 w-1 rounded-l-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300',
        request.tier === ApprovalTier.PASSIVE ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' :
        request.tier === ApprovalTier.ACTIVE ? 'bg-amber-500 shadow-lg shadow-amber-500/20' :
        request.tier === ApprovalTier.EXPLOIT ? 'bg-orange-500 shadow-lg shadow-orange-500/20' :
        'bg-red-500 shadow-lg shadow-red-500/20'
      )} />
    </div>
  );
};

export default ApprovalCard;
