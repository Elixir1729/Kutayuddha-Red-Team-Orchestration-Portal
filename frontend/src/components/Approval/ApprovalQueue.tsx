import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  Filter,
  ChevronDown,
  ChevronRight,
  Shield,
  Inbox,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  ApprovalRequest,
  ApprovalTier,
  ApprovalStatus,
  OperationStatus,
  ToolDomain,
} from '../../types';
import { TIER_CONFIG } from '../../utils/constants';
import ApprovalCard from './ApprovalCard';
import ApprovalDetail from './ApprovalDetail';
import api from '../../services/api';
import useWebSocket from '../../hooks/useWebSocket';

// ---------------------------------------------------------------------------
// Tier section header colors
// ---------------------------------------------------------------------------

const tierHeaderColors: Record<ApprovalTier, string> = {
  [ApprovalTier.PASSIVE]: 'border-emerald-500/40 bg-emerald-500/5',
  [ApprovalTier.ACTIVE]: 'border-amber-500/40 bg-amber-500/5',
  [ApprovalTier.EXPLOIT]: 'border-orange-500/40 bg-orange-500/5',
  [ApprovalTier.LATERAL]: 'border-red-500/40 bg-red-500/5',
};

const tierCountColors: Record<ApprovalTier, string> = {
  [ApprovalTier.PASSIVE]: 'bg-emerald-500/20 text-emerald-400',
  [ApprovalTier.ACTIVE]: 'bg-amber-500/20 text-amber-400',
  [ApprovalTier.EXPLOIT]: 'bg-orange-500/20 text-orange-400',
  [ApprovalTier.LATERAL]: 'bg-red-500/20 text-red-400',
};

const tierIconColors: Record<ApprovalTier, string> = {
  [ApprovalTier.PASSIVE]: 'text-emerald-400',
  [ApprovalTier.ACTIVE]: 'text-amber-400',
  [ApprovalTier.EXPLOIT]: 'text-orange-400',
  [ApprovalTier.LATERAL]: 'text-red-400',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type StatusFilter = 'pending' | 'all';

export const ApprovalQueue: React.FC = () => {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tierFilter, setTierFilter] = useState<ApprovalTier | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [collapsedTiers, setCollapsedTiers] = useState<Set<ApprovalTier>>(new Set());

  // Fetch approvals from API
  const fetchApprovals = useCallback(async (status?: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const filterStatus = status ?? statusFilter;
      const res = await (filterStatus === 'pending'
        ? api.getApprovals('PENDING')
        : api.getApprovals());
      setRequests(res.items || res || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // Initial fetch
  useEffect(() => {
    fetchApprovals();
  }, []);

  // Re-fetch when statusFilter changes
  useEffect(() => {
    fetchApprovals(statusFilter);
  }, [statusFilter]);

  // Subscribe to WebSocket events for new approvals
  useWebSocket((event) => {
    if (event.type === 'approval_required') {
      const newApproval = event.data as ApprovalRequest;
      setRequests((prev) => [newApproval, ...prev]);
    }
  });

  // Filter logic
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (tierFilter !== 'all' && r.tier !== tierFilter) return false;
      if (statusFilter === 'pending' && r.status !== ApprovalStatus.PENDING) return false;
      return true;
    });
  }, [requests, tierFilter, statusFilter]);

  // Group by tier
  const grouped = useMemo(() => {
    const groups: Record<number, ApprovalRequest[]> = {
      [ApprovalTier.PASSIVE]: [],
      [ApprovalTier.ACTIVE]: [],
      [ApprovalTier.EXPLOIT]: [],
      [ApprovalTier.LATERAL]: [],
    };
    for (const r of filteredRequests) {
      groups[r.tier].push(r);
    }
    return groups;
  }, [filteredRequests]);

  const tiers = [ApprovalTier.PASSIVE, ApprovalTier.ACTIVE, ApprovalTier.EXPLOIT, ApprovalTier.LATERAL];

  // Pending counts (always against unfiltered data for tier counts)
  const pendingCounts = useMemo(() => {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const r of requests) {
      if (r.status === ApprovalStatus.PENDING) counts[r.tier]++;
    }
    return counts;
  }, [requests]);

  const totalPending = Object.values(pendingCounts).reduce((a, b) => a + b, 0);

  // Handlers
  const toggleCollapse = (tier: ApprovalTier) => {
    setCollapsedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) {
        next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });
  };

  const handleCardClick = (request: ApprovalRequest) => {
    setSelectedRequest(request);
    setDetailOpen(true);
  };

  const updateRequestStatus = (id: string, status: ApprovalStatus, notes?: string, reviewer?: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              reviewer_id: reviewer || 'operator@redteam.ops',
              decision_notes: notes || undefined,
            }
          : r
      )
    );
  };

  const handleApprove = async (id: string) => {
    try {
      await api.approveRequest(id);
      updateRequestStatus(id, ApprovalStatus.APPROVED);
    } catch (err: any) {
      console.error('Failed to approve:', err);
      setError(err.message || 'Failed to approve request');
    }
  };

  const handleDeny = async (id: string) => {
    try {
      await api.denyRequest(id);
      updateRequestStatus(id, ApprovalStatus.DENIED);
    } catch (err: any) {
      console.error('Failed to deny:', err);
      setError(err.message || 'Failed to deny request');
    }
  };

  const handleDetailApprove = async (id: string, notes: string) => {
    try {
      await api.approveRequest(id, notes);
      updateRequestStatus(id, ApprovalStatus.APPROVED, notes);
      setDetailOpen(false);
      setSelectedRequest(null);
    } catch (err: any) {
      console.error('Failed to approve:', err);
      setError(err.message || 'Failed to approve request');
    }
  };

  const handleDetailDeny = async (id: string, notes: string) => {
    try {
      await api.denyRequest(id, notes);
      updateRequestStatus(id, ApprovalStatus.DENIED, notes);
      setDetailOpen(false);
      setSelectedRequest(null);
    } catch (err: any) {
      console.error('Failed to deny:', err);
      setError(err.message || 'Failed to deny request');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
        <p className="text-sm text-slate-400">Loading approval queue...</p>
      </div>
    );
  }

  // Error state
  if (error && requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <XCircle className="w-10 h-10 text-red-400 mb-4" />
        <p className="text-sm text-red-400 mb-2">Failed to load approvals</p>
        <p className="text-xs text-slate-500 mb-4">{error}</p>
        <button
          onClick={() => fetchApprovals()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-400 bg-indigo-500/10 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Inline error banner (non-blocking) */}
      {error && requests.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-400 flex-1">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Approval Queue</h1>
          <p className="mt-1 text-sm text-slate-400">
            {totalPending} pending {totalPending === 1 ? 'request' : 'requests'} awaiting review
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tiers.map((tier) => {
            const count = pendingCounts[tier];
            if (count === 0) return null;
            return (
              <span
                key={tier}
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md',
                  tierCountColors[tier]
                )}
              >
                <Shield className="w-3 h-3" />
                {count}
              </span>
            );
          })}
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Tier:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTierFilter('all')}
              className={clsx(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                tierFilter === 'all'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              )}
            >
              All
            </button>
            {tiers.map((tier) => {
              const config = TIER_CONFIG[tier];
              return (
                <button
                  key={tier}
                  onClick={() => setTierFilter(tier)}
                  className={clsx(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                    tierFilter === tier
                      ? clsx(config.bgColor, config.color, 'border', config.borderColor)
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
                  )}
                >
                  T{tier}
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-px h-5 bg-slate-700" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Status:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setStatusFilter('pending')}
              className={clsx(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                statusFilter === 'pending'
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              )}
            >
              Pending
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={clsx(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                statusFilter === 'all'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              )}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Empty state when no requests at all */}
      {requests.length === 0 && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-base text-slate-300 font-medium">No approval requests yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Approval requests will appear here when operations require review.
          </p>
        </div>
      )}

      {/* Tier Sections */}
      {requests.length > 0 && (
        <div className="space-y-4">
          {tiers.map((tier) => {
            const items = grouped[tier];
            const tierConfig = TIER_CONFIG[tier];
            const isCollapsed = collapsedTiers.has(tier);
            const pendingCount = items.filter((r) => r.status === ApprovalStatus.PENDING).length;

            return (
              <div key={tier} className="rounded-lg overflow-hidden">
                {/* Section Header */}
                <button
                  onClick={() => toggleCollapse(tier)}
                  className={clsx(
                    'w-full flex items-center justify-between px-4 py-3 border rounded-t-lg transition-colors',
                    tierHeaderColors[tier],
                    isCollapsed && 'rounded-b-lg'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {isCollapsed ? (
                      <ChevronRight className={clsx('w-4 h-4', tierIconColors[tier])} />
                    ) : (
                      <ChevronDown className={clsx('w-4 h-4', tierIconColors[tier])} />
                    )}
                    <Shield className={clsx('w-4 h-4', tierIconColors[tier])} />
                    <span className={clsx('text-sm font-semibold', tierConfig.color)}>
                      {tierConfig.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {pendingCount > 0 && (
                      <span
                        className={clsx(
                          'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
                          tierCountColors[tier]
                        )}
                      >
                        {pendingCount} pending
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      {items.length} {items.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </button>

                {/* Section Content */}
                {!isCollapsed && (
                  <div className="border border-t-0 border-slate-700 rounded-b-lg bg-slate-950/50 p-3">
                    {items.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                          {statusFilter === 'pending' ? (
                            <CheckCircle2 className="w-6 h-6 text-green-400/60" />
                          ) : (
                            <Inbox className="w-6 h-6 text-slate-500" />
                          )}
                        </div>
                        <p className="text-sm text-slate-400 font-medium">
                          {statusFilter === 'pending'
                            ? 'No pending requests'
                            : 'No requests at this tier'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {statusFilter === 'pending'
                            ? `All ${tierConfig.label} items have been reviewed`
                            : 'No operations have been queued for this tier'}
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {items.map((request) => (
                          <ApprovalCard
                            key={request.id}
                            request={request}
                            onApprove={handleApprove}
                            onDeny={handleDeny}
                            onClick={handleCardClick}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No results fallback (filters applied but nothing matches) */}
      {requests.length > 0 && filteredRequests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-base text-slate-300 font-medium">No matching requests</p>
          <p className="text-sm text-slate-500 mt-1">
            Try adjusting your filters to see more results.
          </p>
          <button
            onClick={() => {
              setTierFilter('all');
              setStatusFilter('pending');
            }}
            className="mt-4 px-4 py-2 text-sm font-medium text-indigo-400 bg-indigo-500/10 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Detail Modal */}
      <ApprovalDetail
        request={selectedRequest}
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedRequest(null);
        }}
        onApprove={handleDetailApprove}
        onDeny={handleDetailDeny}
      />
    </div>
  );
};

export default ApprovalQueue;
