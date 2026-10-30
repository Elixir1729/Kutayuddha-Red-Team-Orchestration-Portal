import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Play,
  Pause,
  Square,
  Shield,
  Globe,
  Server,
  Cloud,
  ShieldOff,
  Activity,
  Bug,
  LayoutDashboard,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '../common/Badge';
import { StatusIndicator } from '../common/StatusIndicator';
import {
  Engagement,
  EngagementStatus,
  Operation,
  OperationStatus,
  ToolDomain,
  Finding,
  FindingSeverity,
  WebSocketEvent,
} from '../../types';
import { STATUS_CONFIG, OPERATION_STATUS_CONFIG, TOOL_DOMAIN_LABELS, SEVERITY_CONFIG } from '../../utils/constants';
import { formatDate, truncate } from '../../utils/formatters';
import api from '../../services/api';
import { useWebSocket } from '../../hooks/useWebSocket';

// --- Badge variant maps ---

const STATUS_BADGE_VARIANT: Record<EngagementStatus, string> = {
  [EngagementStatus.DRAFT]: 'draft',
  [EngagementStatus.ACTIVE]: 'success',
  [EngagementStatus.PAUSED]: 'warning',
  [EngagementStatus.COMPLETED]: 'low',
  [EngagementStatus.ABORTED]: 'danger',
};

const OP_STATUS_BADGE_VARIANT: Record<OperationStatus, string> = {
  [OperationStatus.PLANNED]: 'default',
  [OperationStatus.PENDING_APPROVAL]: 'warning',
  [OperationStatus.APPROVED]: 'success',
  [OperationStatus.EXECUTING]: 'active',
  [OperationStatus.COMPLETED]: 'success',
  [OperationStatus.FAILED]: 'danger',
  [OperationStatus.CANCELLED]: 'default',
  [OperationStatus.BLOCKED]: 'danger',
};

const SEVERITY_BADGE_VARIANT: Record<FindingSeverity, string> = {
  [FindingSeverity.INFO]: 'info',
  [FindingSeverity.LOW]: 'low',
  [FindingSeverity.MEDIUM]: 'medium',
  [FindingSeverity.HIGH]: 'high',
  [FindingSeverity.CRITICAL]: 'critical',
};

const DOMAIN_ICONS: Record<ToolDomain, React.ReactNode> = {
  [ToolDomain.NETWORK]: <Globe className="w-4 h-4" />,
  [ToolDomain.CLOUD]: <Cloud className="w-4 h-4" />,
  [ToolDomain.AD]: <Server className="w-4 h-4" />,
  [ToolDomain.AI_LLM]: <Activity className="w-4 h-4" />,
};

// --- Tabs ---

type TabKey = 'overview' | 'operations' | 'findings';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
  { key: 'operations', label: 'Operations', icon: <Activity className="w-4 h-4" /> },
  { key: 'findings', label: 'Findings', icon: <Bug className="w-4 h-4" /> },
];

// --- Component ---

const EngagementDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [engRes, opsRes, findRes] = await Promise.all([
        api.getEngagement(id),
        api.getOperations(id),
        api.getFindings(id),
      ]);
      setEngagement(engRes);
      setOperations((opsRes as any).items || (Array.isArray(opsRes) ? opsRes : []));
      setFindings((findRes as any).items || (Array.isArray(findRes) ? findRes : []));
    } catch (err: any) {
      setError(err.message || 'Failed to load engagement');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket: live updates for operations and findings
  const handleWsEvent = useCallback((event: WebSocketEvent) => {
    if (event.type === 'operation_update') {
      const op = event.data as Operation;
      if (op.engagement_id === id) {
        setOperations((prev) => {
          const idx = prev.findIndex((o) => o.id === op.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = op;
            return next;
          }
          return [op, ...prev];
        });
      }
    } else if (event.type === 'finding_discovered') {
      const finding = event.data as Finding;
      if (finding.engagement_id === id) {
        setFindings((prev) => [finding, ...prev]);
      }
    }
  }, [id]);

  useWebSocket(handleWsEvent);

  // Action handlers
  const handleStart = async () => {
    if (!id) return;
    setActionLoading('start');
    try {
      await api.startEngagement(id);
      const res = await api.getEngagement(id);
      setEngagement(res);
    } catch (err: any) {
      // Could show a toast here; for now just log
      console.error('Failed to start engagement:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async () => {
    if (!id) return;
    setActionLoading('pause');
    try {
      await api.pauseEngagement(id);
      const res = await api.getEngagement(id);
      setEngagement(res);
    } catch (err: any) {
      console.error('Failed to pause engagement:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async () => {
    if (!id) return;
    setActionLoading('stop');
    try {
      await api.stopEngagement(id);
      const res = await api.getEngagement(id);
      setEngagement(res);
    } catch (err: any) {
      console.error('Failed to stop engagement:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const canStart = engagement?.status === EngagementStatus.DRAFT || engagement?.status === EngagementStatus.PAUSED;
  const canPause = engagement?.status === EngagementStatus.ACTIVE;
  const canStop = engagement?.status === EngagementStatus.ACTIVE || engagement?.status === EngagementStatus.PAUSED;

  const operationsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    operations.forEach((op) => {
      counts[op.status] = (counts[op.status] || 0) + 1;
    });
    return counts;
  }, [operations]);

  const findingsBySeverity = useMemo(() => {
    const counts: Record<string, number> = {};
    findings.forEach((f) => {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    });
    return counts;
  }, [findings]);

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading engagement...</p>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-400 bg-indigo-500/10 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  // --- Not found ---
  if (!engagement) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield className="w-10 h-10 text-slate-600 mb-3" />
        <p className="text-base text-slate-300 font-medium">Engagement not found</p>
        <p className="text-sm text-slate-500 mt-1">The engagement may have been deleted or the ID is invalid.</p>
        <button
          onClick={() => navigate('/engagements')}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-400 bg-indigo-500/10 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Engagements
        </button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[engagement.status];

  const ActionSpinner = () => (
    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/engagements')}
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Engagements
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Shield className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-100">{engagement.name}</h1>
              <Badge variant={STATUS_BADGE_VARIANT[engagement.status] as any} size="md">
                <span className={clsx('w-2 h-2 rounded-full mr-2', statusCfg.dotColor)} />
                {statusCfg.label}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{id}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {canStart && (
            <button
              onClick={handleStart}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {actionLoading === 'start' ? <ActionSpinner /> : <Play className="w-4 h-4" />}
              {engagement.status === EngagementStatus.PAUSED ? 'Resume' : 'Start'}
            </button>
          )}
          {canPause && (
            <button
              onClick={handlePause}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {actionLoading === 'pause' ? <ActionSpinner /> : <Pause className="w-4 h-4" />}
              Pause
            </button>
          )}
          {canStop && (
            <button
              onClick={handleStop}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {actionLoading === 'stop' ? <ActionSpinner /> : <Square className="w-4 h-4" />}
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.key === 'operations' && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-slate-800 text-slate-400">
                  {operations.length}
                </span>
              )}
              {tab.key === 'findings' && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-slate-800 text-slate-400">
                  {findings.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}

      {/* ========== Overview ========== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Operations</p>
              <p className="mt-1 text-2xl font-bold text-slate-100">{operations.length}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Findings</p>
              <p className="mt-1 text-2xl font-bold text-slate-100">{findings.length}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Critical / High</p>
              <p className="mt-1 text-2xl font-bold text-red-400">
                {(findingsBySeverity[FindingSeverity.CRITICAL] || 0) +
                  (findingsBySeverity[FindingSeverity.HIGH] || 0)}
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider">In Progress</p>
              <p className="mt-1 text-2xl font-bold text-blue-400">
                {operationsByStatus[OperationStatus.EXECUTING] || 0}
              </p>
            </div>
          </div>

          {/* Scope & Dates */}
          <div className="grid grid-cols-2 gap-6">
            {/* Scope */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Scope
              </h3>
              {engagement.scope_config.cidrs.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">CIDR Ranges</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {engagement.scope_config.cidrs.map((c) => (
                      <Badge key={c} variant="info" size="sm">{c}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {engagement.scope_config.domains.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">Domains</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {engagement.scope_config.domains.map((d) => (
                      <Badge key={d} variant="success" size="sm">{d}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {engagement.scope_config.cloud_accounts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Cloud className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">Cloud Accounts</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {engagement.scope_config.cloud_accounts.map((a) => (
                      <Badge key={a} variant="warning" size="sm">{a}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {engagement.scope_config.exclusions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldOff className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">Exclusions</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {engagement.scope_config.exclusions.map((e) => (
                      <Badge key={e} variant="danger" size="sm">{e}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dates & Rules */}
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                  Timeline
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Created</span>
                    <span className="text-slate-300">{formatDate(engagement.created_at)}</span>
                  </div>
                  {engagement.started_at && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Started</span>
                      <span className="text-slate-300">{formatDate(engagement.started_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                  Rules of Engagement
                </h3>
                <pre className="text-sm text-slate-400 whitespace-pre-wrap font-mono leading-relaxed">
                  {engagement.rules_of_engagement}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== Operations ========== */}
      {activeTab === 'operations' && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          {operations.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No operations yet.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Operation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Domain
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Target
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {operations.map((op) => {
                  const opStatusCfg = OPERATION_STATUS_CONFIG[op.status];
                  return (
                    <tr key={op.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400">{DOMAIN_ICONS[op.tool_domain]}</span>
                          <div>
                            <div className="text-sm font-medium text-slate-200">
                              {op.action_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                            </div>
                            <div className="text-xs text-slate-500">{op.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-400">
                          {TOOL_DOMAIN_LABELS[op.tool_domain] || op.tool_domain}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-300 font-mono">
                          {truncate(op.target, 35)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={OP_STATUS_BADGE_VARIANT[op.status] as any}>
                          <span
                            className={clsx(
                              'w-1.5 h-1.5 rounded-full mr-1.5',
                              opStatusCfg.dotColor,
                              opStatusCfg.animate && 'animate-pulse'
                            )}
                          />
                          {opStatusCfg.label}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-400">{formatDate(op.created_at)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========== Findings ========== */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          {findings.length === 0 && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-12 text-center">
              <Bug className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No findings discovered yet.</p>
            </div>
          )}
          {findings.map((finding) => {
            const sevCfg = SEVERITY_CONFIG[finding.severity];
            return (
              <div
                key={finding.id}
                className="bg-slate-900 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={clsx('mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0', sevCfg.dotColor)} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-200">{finding.title}</h3>
                        <Badge variant={SEVERITY_BADGE_VARIANT[finding.severity] as any} size="sm">
                          {sevCfg.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-400 leading-relaxed">
                        {finding.description}
                      </p>
                      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                        <span className="font-mono">{finding.affected_asset}</span>
                        {finding.cvss_score !== undefined && (
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            CVSS {finding.cvss_score.toFixed(1)}
                          </span>
                        )}
                        <span>{formatDate(finding.created_at)}</span>
                        {finding.operation_id && (
                          <span className="text-slate-600">{finding.operation_id}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EngagementDetail;
