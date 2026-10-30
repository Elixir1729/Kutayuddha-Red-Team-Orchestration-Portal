import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, ChevronRight, Shield, RefreshCw, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '../common/Badge';
import { Engagement, EngagementStatus } from '../../types';
import { STATUS_CONFIG } from '../../utils/constants';
import { formatDate, truncate } from '../../utils/formatters';
import api from '../../services/api';

const STATUS_BADGE_VARIANT: Record<EngagementStatus, 'draft' | 'success' | 'warning' | 'low' | 'danger'> = {
  [EngagementStatus.DRAFT]: 'draft',
  [EngagementStatus.ACTIVE]: 'success',
  [EngagementStatus.PAUSED]: 'warning',
  [EngagementStatus.COMPLETED]: 'low',
  [EngagementStatus.ABORTED]: 'danger',
};

function summarizeScope(scope: Engagement['scope_config']): string {
  const parts: string[] = [];
  if (scope.cidrs.length > 0) parts.push(`${scope.cidrs.length} CIDR${scope.cidrs.length > 1 ? 's' : ''}`);
  if (scope.domains.length > 0) parts.push(`${scope.domains.length} domain${scope.domains.length > 1 ? 's' : ''}`);
  if (scope.cloud_accounts.length > 0) parts.push(`${scope.cloud_accounts.length} cloud acct${scope.cloud_accounts.length > 1 ? 's' : ''}`);
  if (scope.exclusions.length > 0) parts.push(`${scope.exclusions.length} exclusion${scope.exclusions.length > 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(', ') : 'No scope defined';
}

const EngagementList: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EngagementStatus | 'ALL'>('ALL');
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEngagements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getEngagements();
      setEngagements((res as any).items || (Array.isArray(res) ? res : []));
    } catch (err: any) {
      setError(err.message || 'Failed to load engagements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEngagements();
  }, [fetchEngagements]);

  const filteredEngagements = useMemo(() => {
    return engagements.filter((eng) => {
      const matchesSearch =
        searchQuery === '' ||
        eng.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        eng.scope_config.domains.some((d) => d.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'ALL' || eng.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, statusFilter, engagements]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Engagements</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage red team engagements and penetration tests
          </p>
        </div>
        <button
          onClick={() => navigate('/engagements/new')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          <Plus className="w-4 h-4" />
          New Engagement
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search engagements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EngagementStatus | 'ALL')}
          className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          <option value="ALL">All Statuses</option>
          {Object.values(EngagementStatus).map((status) => (
            <option key={status} value={status}>
              {STATUS_CONFIG[status].label}
            </option>
          ))}
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Loading engagements...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={fetchEngagements}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-400 bg-indigo-500/10 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && engagements.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-base text-slate-300 font-medium">No engagements yet</p>
          <p className="text-sm text-slate-500 mt-1">Create one to get started</p>
          <button
            onClick={() => navigate('/engagements/new')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Engagement
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && engagements.length > 0 && (
        <>
          <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Scope Summary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredEngagements.map((engagement) => {
                  const statusCfg = STATUS_CONFIG[engagement.status];
                  return (
                    <tr
                      key={engagement.id}
                      onClick={() => navigate(`/engagements/${engagement.id}`)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-indigo-400" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-200">
                              {engagement.name}
                            </div>
                            <div className="text-xs text-slate-500">{engagement.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={STATUS_BADGE_VARIANT[engagement.status]}>
                          <span
                            className={clsx(
                              'w-1.5 h-1.5 rounded-full mr-1.5',
                              statusCfg.dotColor
                            )}
                          />
                          {statusCfg.label}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-400">
                          {truncate(summarizeScope(engagement.scope_config), 50)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-400">
                          {formatDate(engagement.created_at)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
                      </td>
                    </tr>
                  );
                })}
                {filteredEngagements.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <p className="text-sm text-slate-500">No engagements found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="text-sm text-slate-500">
            Showing {filteredEngagements.length} of {engagements.length} engagements
          </div>
        </>
      )}
    </div>
  );
};

export default EngagementList;
