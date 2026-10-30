import { FindingSeverity, ApprovalTier } from '../types';
import { SEVERITY_CONFIG, TIER_CONFIG } from './constants';

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(dateString);
}

export function formatCountdown(targetDateString: string): string {
  const target = new Date(targetDateString);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const diffSec = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatSeverity(severity: FindingSeverity): string {
  return SEVERITY_CONFIG[severity]?.label ?? severity;
}

export function formatTier(tier: ApprovalTier): string {
  return TIER_CONFIG[tier]?.label ?? `Tier ${tier}`;
}

export function formatCvss(score: number): string {
  return score.toFixed(1);
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
