import React from 'react';
import { Shield, Target, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { Finding, FindingSeverity } from '../../types';
import { SEVERITY_CONFIG } from '../../utils/constants';
import { formatRelativeTime, formatCvss, truncate } from '../../utils/formatters';
import Badge from '../common/Badge';

interface FindingCardProps {
  finding: Finding;
  onClick: (finding: Finding) => void;
}

const severityBorderColors: Record<FindingSeverity, string> = {
  [FindingSeverity.INFO]: 'border-l-slate-400',
  [FindingSeverity.LOW]: 'border-l-blue-400',
  [FindingSeverity.MEDIUM]: 'border-l-yellow-400',
  [FindingSeverity.HIGH]: 'border-l-orange-400',
  [FindingSeverity.CRITICAL]: 'border-l-red-400',
};

const severityBadgeVariant: Record<FindingSeverity, 'info' | 'low' | 'medium' | 'high' | 'critical'> = {
  [FindingSeverity.INFO]: 'info',
  [FindingSeverity.LOW]: 'low',
  [FindingSeverity.MEDIUM]: 'medium',
  [FindingSeverity.HIGH]: 'high',
  [FindingSeverity.CRITICAL]: 'critical',
};

export const FindingCard: React.FC<FindingCardProps> = ({ finding, onClick }) => {
  const config = SEVERITY_CONFIG[finding.severity];

  return (
    <button
      type="button"
      onClick={() => onClick(finding)}
      className={clsx(
        'w-full text-left rounded-lg bg-slate-900 border border-slate-700 border-l-4 p-4',
        'hover:bg-slate-800 hover:border-slate-600 transition-all duration-150 cursor-pointer',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
        severityBorderColors[finding.severity]
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant={severityBadgeVariant[finding.severity]} size="sm">
              {config.label}
            </Badge>
            {finding.cvss_score !== undefined && (
              <span
                className={clsx(
                  'text-xs font-mono font-semibold px-1.5 py-0.5 rounded',
                  finding.cvss_score >= 9.0
                    ? 'bg-red-500/15 text-red-400'
                    : finding.cvss_score >= 7.0
                    ? 'bg-orange-500/15 text-orange-400'
                    : finding.cvss_score >= 4.0
                    ? 'bg-yellow-500/15 text-yellow-400'
                    : 'bg-blue-500/15 text-blue-400'
                )}
              >
                CVSS {formatCvss(finding.cvss_score)}
              </span>
            )}
          </div>

          <h3 className="text-sm font-semibold text-slate-100 mb-1 truncate">
            {finding.title}
          </h3>

          <p className="text-xs text-slate-400 mb-2 leading-relaxed">
            {truncate(finding.description, 140)}
          </p>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Target className="w-3 h-3" />
              <span className="truncate max-w-[180px]">{finding.affected_asset}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(finding.created_at)}
            </span>
          </div>
        </div>

        <Shield className={clsx('w-5 h-5 flex-shrink-0 mt-0.5', config.color)} />
      </div>
    </button>
  );
};

export default FindingCard;
