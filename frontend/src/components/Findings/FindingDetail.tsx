import React from 'react';
import { Shield, Target, Calendar, Link, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { Finding, FindingSeverity } from '../../types';
import { SEVERITY_CONFIG } from '../../utils/constants';
import { formatDate, formatCvss } from '../../utils/formatters';
import Badge from '../common/Badge';
import Modal from '../common/Modal';

interface FindingDetailProps {
  finding: Finding | null;
  isOpen: boolean;
  onClose: () => void;
}

const severityBadgeVariant: Record<FindingSeverity, 'info' | 'low' | 'medium' | 'high' | 'critical'> = {
  [FindingSeverity.INFO]: 'info',
  [FindingSeverity.LOW]: 'low',
  [FindingSeverity.MEDIUM]: 'medium',
  [FindingSeverity.HIGH]: 'high',
  [FindingSeverity.CRITICAL]: 'critical',
};

const cvssBarColor = (score: number): string => {
  if (score >= 9.0) return 'bg-red-500';
  if (score >= 7.0) return 'bg-orange-500';
  if (score >= 4.0) return 'bg-yellow-500';
  return 'bg-blue-500';
};

const cvssLabel = (score: number): string => {
  if (score >= 9.0) return 'Critical';
  if (score >= 7.0) return 'High';
  if (score >= 4.0) return 'Medium';
  if (score >= 0.1) return 'Low';
  return 'None';
};

export const FindingDetail: React.FC<FindingDetailProps> = ({ finding, isOpen, onClose }) => {
  if (!finding) return null;

  const config = SEVERITY_CONFIG[finding.severity];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Finding Details" size="lg">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={severityBadgeVariant[finding.severity]} size="md">
              <Shield className="w-3.5 h-3.5 mr-1" />
              {config.label}
            </Badge>
            <span className="text-xs text-slate-500 font-mono">{finding.id}</span>
          </div>
          <h3 className="text-xl font-bold text-slate-100">{finding.title}</h3>
        </div>

        {/* Description */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">
            Description
          </h4>
          <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">
            {finding.description}
          </p>
        </div>

        {/* CVSS Score */}
        {finding.cvss_score !== undefined && (
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">
              CVSS Score
            </h4>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-400">
                    {cvssLabel(finding.cvss_score)}
                  </span>
                  <span
                    className={clsx(
                      'text-lg font-bold font-mono',
                      finding.cvss_score >= 9.0
                        ? 'text-red-400'
                        : finding.cvss_score >= 7.0
                        ? 'text-orange-400'
                        : finding.cvss_score >= 4.0
                        ? 'text-yellow-400'
                        : 'text-blue-400'
                    )}
                  >
                    {formatCvss(finding.cvss_score)}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all duration-500', cvssBarColor(finding.cvss_score))}
                    style={{ width: `${(finding.cvss_score / 10) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-slate-600">
                  <span>0</span>
                  <span>10</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Target className="w-3.5 h-3.5" />
              Affected Asset
            </div>
            <p className="text-sm text-slate-200 font-mono break-all">{finding.affected_asset}</p>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Calendar className="w-3.5 h-3.5" />
              Discovered
            </div>
            <p className="text-sm text-slate-200">{formatDate(finding.created_at)}</p>
          </div>

          {finding.operation_id && (
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Link className="w-3.5 h-3.5" />
                Related Operation
              </div>
              <p className="text-sm text-indigo-400 font-mono">{finding.operation_id}</p>
            </div>
          )}

          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Engagement
            </div>
            <p className="text-sm text-slate-200 font-mono">{finding.engagement_id}</p>
          </div>
        </div>

        {/* Evidence */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">
            Evidence
          </h4>
          <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-800/70 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-mono">JSON</span>
            </div>
            <pre className="p-4 text-xs text-slate-300 font-mono overflow-x-auto leading-relaxed max-h-64 overflow-y-auto">
              {JSON.stringify(finding.evidence, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default FindingDetail;
