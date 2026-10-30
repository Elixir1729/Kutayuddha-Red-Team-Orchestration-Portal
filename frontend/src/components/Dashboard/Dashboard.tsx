import React, { useState, useEffect, useCallback } from 'react';
import { StatsCards } from './StatsCards';
import { LiveOperations } from './LiveOperations';
import { AttackGraph } from './AttackGraph';
import { Badge } from '../common/Badge';
import { ApprovalTier, FindingSeverity, Finding, WebSocketEvent } from '../../types';
import { TIER_CONFIG, SEVERITY_CONFIG } from '../../utils/constants';
import { formatRelativeTime, formatCvss } from '../../utils/formatters';
import { ShieldAlert, FileWarning, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import useWebSocket from '../../hooks/useWebSocket';

// ---------------------------------------------------------------------------
// Helper to map FindingSeverity to Badge variant
// ---------------------------------------------------------------------------
const severityToBadgeVariant: Record<FindingSeverity, 'info' | 'low' | 'medium' | 'high' | 'critical'> = {
  [FindingSeverity.INFO]: 'info',
  [FindingSeverity.LOW]: 'low',
  [FindingSeverity.MEDIUM]: 'medium',
  [FindingSeverity.HIGH]: 'high',
  [FindingSeverity.CRITICAL]: 'critical',
};

// ---------------------------------------------------------------------------
// Interfaces for dashboard data
// ---------------------------------------------------------------------------
interface DashboardStats {
  active_engagements: number;
  pending_approvals: number;
  operations_today: number;
  critical_findings: number;
}

interface TierApprovalCount {
  tier: ApprovalTier;
  count: number;
}

interface RecentFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  affectedAsset: string;
  affected_asset?: string;
  cvssScore?: number;
  cvss_score?: number;
  createdAt?: string;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const Dashboard: React.FC = () => {
  // Stats
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Approvals by tier
  const [approvalsByTier, setApprovalsByTier] = useState<TierApprovalCount[]>([
    { tier: ApprovalTier.PASSIVE, count: 0 },
    { tier: ApprovalTier.ACTIVE, count: 0 },
    { tier: ApprovalTier.EXPLOIT, count: 0 },
    { tier: ApprovalTier.LATERAL, count: 0 },
  ]);

  // Recent findings
  const [recentFindings, setRecentFindings] = useState<RecentFinding[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(true);

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await api.getDashboardStats();
      setStats(res);

      // If the response includes approval tier breakdown, use it
      if (res.approvals_by_tier) {
        setApprovalsByTier([
          { tier: ApprovalTier.PASSIVE, count: res.approvals_by_tier.passive || res.approvals_by_tier[0] || 0 },
          { tier: ApprovalTier.ACTIVE, count: res.approvals_by_tier.active || res.approvals_by_tier[1] || 0 },
          { tier: ApprovalTier.EXPLOIT, count: res.approvals_by_tier.exploit || res.approvals_by_tier[2] || 0 },
          { tier: ApprovalTier.LATERAL, count: res.approvals_by_tier.lateral || res.approvals_by_tier[3] || 0 },
        ]);
      }
    } catch (err: any) {
      setStatsError(err.message || 'Failed to load dashboard stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Fetch recent findings
  const fetchFindings = useCallback(async () => {
    setFindingsLoading(true);
    try {
      const res = await api.getFindings();
      const items: any[] = res.items || res || [];
      // Take the 5 most recent
      const sorted = items
        .sort((a: any, b: any) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime())
        .slice(0, 5);
      setRecentFindings(sorted);
    } catch {
      // Non-critical: findings section will show empty
    } finally {
      setFindingsLoading(false);
    }
  }, []);

  // Fetch approvals for tier counts (fallback if stats doesn't include breakdown)
  const fetchApprovalCounts = useCallback(async () => {
    try {
      const res = await api.getApprovals('PENDING');
      const items: any[] = res.items || res || [];
      const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      items.forEach((r: any) => {
        if (typeof r.tier === 'number' && counts[r.tier] !== undefined) {
          counts[r.tier]++;
        }
      });
      setApprovalsByTier([
        { tier: ApprovalTier.PASSIVE, count: counts[0] },
        { tier: ApprovalTier.ACTIVE, count: counts[1] },
        { tier: ApprovalTier.EXPLOIT, count: counts[2] },
        { tier: ApprovalTier.LATERAL, count: counts[3] },
      ]);
    } catch {
      // Non-critical: keep default zeroes
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchFindings();
    fetchApprovalCounts();
  }, [fetchStats, fetchFindings, fetchApprovalCounts]);

  // WebSocket: update stats in real-time
  useWebSocket(useCallback((event: WebSocketEvent) => {
    if (event.type === 'finding_discovered') {
      const finding = event.data as Finding;
      setRecentFindings((prev) => [
        {
          id: finding.id,
          title: finding.title,
          severity: finding.severity,
          affectedAsset: finding.affected_asset,
          affected_asset: finding.affected_asset,
          cvssScore: finding.cvss_score,
          cvss_score: finding.cvss_score,
          createdAt: finding.created_at,
          created_at: finding.created_at,
        },
        ...prev.slice(0, 4),
      ]);
      // Bump critical findings count if applicable
      if (finding.severity === FindingSeverity.CRITICAL && stats) {
        setStats((prev) => prev ? { ...prev, critical_findings: (prev.critical_findings || 0) + 1 } : prev);
      }
    }
    if (event.type === 'approval_required') {
      // Refresh approval counts
      fetchApprovalCounts();
      if (stats) {
        setStats((prev) => prev ? { ...prev, pending_approvals: (prev.pending_approvals || 0) + 1 } : prev);
      }
    }
    if (event.type === 'operation_update') {
      // Bump operations count
      if (stats) {
        setStats((prev) => prev ? { ...prev, operations_today: (prev.operations_today || 0) + 1 } : prev);
      }
    }
  }, [stats, fetchApprovalCounts]));

  const totalPending = approvalsByTier.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="space-y-6">
      {/* ---- Top row: Stats Cards ---- */}
      <StatsCards
        activeEngagements={stats?.active_engagements ?? 0}
        pendingApprovals={stats?.pending_approvals ?? 0}
        operationsToday={stats?.operations_today ?? 0}
        criticalFindings={stats?.critical_findings ?? 0}
        loading={statsLoading}
      />

      {statsError && (
        <div className="flex items-center justify-center gap-3 py-2">
          <p className="text-sm text-red-400">{statsError}</p>
          <button
            onClick={fetchStats}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/20 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* ---- Middle row: Live Operations (2/3) + Approvals mini-card (1/3) ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LiveOperations />
        </div>

        {/* Approval summary mini-card */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700">
            <ShieldAlert className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-200">Pending Approvals</h3>
            <span className="ml-auto inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded-full bg-indigo-500/20 text-indigo-300">
              {totalPending}
            </span>
          </div>
          <div className="flex-1 divide-y divide-slate-800">
            {approvalsByTier.map((item) => {
              const cfg = TIER_CONFIG[item.tier];
              return (
                <div
                  key={item.tier}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/60 transition-colors duration-150"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${cfg.color.replace('text-', 'bg-')}`} />
                    <span className="text-sm text-slate-300">{cfg.label}</span>
                  </div>
                  <span
                    className={`text-lg font-semibold ${
                      item.count > 0 ? cfg.color : 'text-slate-600'
                    }`}
                  >
                    {item.count}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-3 border-t border-slate-700">
            <button className="w-full text-center text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors duration-150">
              View all approvals
            </button>
          </div>
        </div>
      </div>

      {/* ---- Bottom row: Attack Graph (1/2) + Recent Findings (1/2) ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AttackGraph />

        {/* Recent findings list */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700">
            <FileWarning className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-200">Recent Findings</h3>
          </div>
          <div className="flex-1 divide-y divide-slate-800">
            {findingsLoading ? (
              <div className="flex items-center justify-center py-12">
                <span className="animate-spin w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full" />
              </div>
            ) : recentFindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileWarning className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-sm text-slate-500">No findings yet</p>
                <p className="text-xs text-slate-600 mt-1">Findings will appear here as they are discovered</p>
              </div>
            ) : (
              recentFindings.map((finding) => {
                const severity = finding.severity;
                const sevCfg = SEVERITY_CONFIG[severity];
                const asset = finding.affectedAsset || finding.affected_asset || '';
                const cvss = finding.cvssScore ?? finding.cvss_score;
                const createdAt = finding.createdAt || finding.created_at || '';
                return (
                  <div
                    key={finding.id}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-800/60 transition-colors duration-150"
                  >
                    {/* Severity dot */}
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${sevCfg.dotColor}`} />

                    {/* Title + asset */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        {finding.title}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {asset}
                      </p>
                    </div>

                    {/* Severity badge + CVSS */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={severityToBadgeVariant[severity]} size="sm">
                        {sevCfg.label}
                      </Badge>
                      {cvss !== undefined && (
                        <span className="text-xs text-slate-500">
                          CVSS {formatCvss(cvss)}
                        </span>
                      )}
                    </div>

                    {/* Timestamp */}
                    {createdAt && (
                      <span className="text-xs text-slate-500 w-14 text-right shrink-0 mt-0.5">
                        {formatRelativeTime(createdAt)}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="px-5 py-3 border-t border-slate-700">
            <button className="w-full text-center text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors duration-150">
              View all findings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
