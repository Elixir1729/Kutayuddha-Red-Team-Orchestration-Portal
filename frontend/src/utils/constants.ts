import { ApprovalTier, FindingSeverity, EngagementStatus, OperationStatus } from '../types';

export const TIER_CONFIG: Record<ApprovalTier, { label: string; color: string; bgColor: string; borderColor: string; description: string }> = {
  [ApprovalTier.PASSIVE]: {
    label: 'Tier 0 - Passive',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 dark:bg-emerald-900/30',
    borderColor: 'border-emerald-500/30',
    description: 'Auto-approved reconnaissance and passive information gathering',
  },
  [ApprovalTier.ACTIVE]: {
    label: 'Tier 1 - Active',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 dark:bg-amber-900/30',
    borderColor: 'border-amber-500/30',
    description: 'Active scanning and enumeration - requires review with auto-approve countdown',
  },
  [ApprovalTier.EXPLOIT]: {
    label: 'Tier 2 - Exploit',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 dark:bg-orange-900/30',
    borderColor: 'border-orange-500/30',
    description: 'Exploitation attempts - hard block requiring explicit approval',
  },
  [ApprovalTier.LATERAL]: {
    label: 'Tier 3 - Lateral',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 dark:bg-red-900/30',
    borderColor: 'border-red-500/30',
    description: 'Lateral movement and privilege escalation - requires senior + lead approval',
  },
};

export const SEVERITY_CONFIG: Record<FindingSeverity, { label: string; color: string; bgColor: string; dotColor: string }> = {
  [FindingSeverity.INFO]: {
    label: 'Info',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10 dark:bg-slate-700/30',
    dotColor: 'bg-slate-400',
  },
  [FindingSeverity.LOW]: {
    label: 'Low',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 dark:bg-blue-900/30',
    dotColor: 'bg-blue-400',
  },
  [FindingSeverity.MEDIUM]: {
    label: 'Medium',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10 dark:bg-yellow-900/30',
    dotColor: 'bg-yellow-400',
  },
  [FindingSeverity.HIGH]: {
    label: 'High',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 dark:bg-orange-900/30',
    dotColor: 'bg-orange-400',
  },
  [FindingSeverity.CRITICAL]: {
    label: 'Critical',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 dark:bg-red-900/30',
    dotColor: 'bg-red-400',
  },
};

export const STATUS_CONFIG: Record<EngagementStatus, { label: string; color: string; dotColor: string }> = {
  [EngagementStatus.DRAFT]: { label: 'Draft', color: 'text-slate-400', dotColor: 'bg-slate-400' },
  [EngagementStatus.ACTIVE]: { label: 'Active', color: 'text-green-400', dotColor: 'bg-green-400' },
  [EngagementStatus.PAUSED]: { label: 'Paused', color: 'text-yellow-400', dotColor: 'bg-yellow-400' },
  [EngagementStatus.COMPLETED]: { label: 'Completed', color: 'text-blue-400', dotColor: 'bg-blue-400' },
  [EngagementStatus.ABORTED]: { label: 'Aborted', color: 'text-red-400', dotColor: 'bg-red-400' },
};

export const OPERATION_STATUS_CONFIG: Record<OperationStatus, { label: string; color: string; dotColor: string; animate?: boolean }> = {
  [OperationStatus.PLANNED]: { label: 'Planned', color: 'text-slate-400', dotColor: 'bg-slate-400' },
  [OperationStatus.PENDING_APPROVAL]: { label: 'Pending Approval', color: 'text-yellow-400', dotColor: 'bg-yellow-400' },
  [OperationStatus.APPROVED]: { label: 'Approved', color: 'text-green-400', dotColor: 'bg-green-400' },
  [OperationStatus.EXECUTING]: { label: 'Executing', color: 'text-blue-400', dotColor: 'bg-blue-400', animate: true },
  [OperationStatus.COMPLETED]: { label: 'Completed', color: 'text-green-400', dotColor: 'bg-green-400' },
  [OperationStatus.FAILED]: { label: 'Failed', color: 'text-red-400', dotColor: 'bg-red-400' },
  [OperationStatus.CANCELLED]: { label: 'Cancelled', color: 'text-slate-400', dotColor: 'bg-slate-400' },
  [OperationStatus.BLOCKED]: { label: 'Blocked', color: 'text-red-400', dotColor: 'bg-red-400' },
};

export const TOOL_DOMAIN_LABELS: Record<string, string> = {
  AD: 'Active Directory',
  CLOUD: 'Cloud',
  NETWORK: 'Network',
  AI_LLM: 'AI / LLM',
};
