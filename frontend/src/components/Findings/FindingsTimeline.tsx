import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Filter, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { Finding, FindingSeverity } from '../../types';
import { SEVERITY_CONFIG } from '../../utils/constants';
import FindingCard from './FindingCard';
import FindingDetail from './FindingDetail';
import api from '../../services/api';
import useWebSocket from '../../hooks/useWebSocket';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const FindingsTimeline: React.FC = () => {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSeverities, setActiveSeverities] = useState<Set<FindingSeverity>>(
    new Set(Object.values(FindingSeverity))
  );
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchFindings = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getFindings()
      .then((res: any) => {
        setFindings(res.items || res || []);
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load findings');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchFindings();
  }, [fetchFindings]);

  // Subscribe to WebSocket for new findings
  useWebSocket((event) => {
    if (event.type === 'finding_discovered') {
      const newFinding = event.data as Finding;
      setFindings((prev) => [newFinding, ...prev]);
    }
  });

  const toggleSeverity = (severity: FindingSeverity) => {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) {
        next.delete(severity);
      } else {
        next.add(severity);
      }
      return next;
    });
  };

  const filteredFindings = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return findings
      .filter((f) => activeSeverities.has(f.severity))
      .filter(
        (f) =>
          !q ||
          f.title.toLowerCase().includes(q) ||
          f.affected_asset.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [findings, searchQuery, activeSeverities]);

  const handleCardClick = (finding: Finding) => {
    setSelectedFinding(finding);
    setDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setDetailOpen(false);
    setSelectedFinding(null);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
        <p className="text-sm text-slate-400">Loading findings...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <ShieldAlert className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchFindings}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-400 bg-indigo-500/10 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (findings.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-indigo-400" />
              Findings Timeline
            </h2>
            <p className="text-sm text-slate-400 mt-1">0 findings discovered</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-24">
          <ShieldAlert className="w-12 h-12 text-slate-700 mb-3" />
          <p className="text-base text-slate-300 font-medium">No findings yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Findings will appear here as they are discovered during engagements.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-indigo-400" />
            Findings Timeline
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {filteredFindings.length} finding{filteredFindings.length !== 1 ? 's' : ''} discovered
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search findings by title, asset, or description..."
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
          />
        </div>

        {/* Severity filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-xs text-slate-500 mr-1">Severity:</span>
          {Object.values(FindingSeverity).map((severity) => {
            const config = SEVERITY_CONFIG[severity];
            const isActive = activeSeverities.has(severity);
            return (
              <button
                key={severity}
                type="button"
                onClick={() => toggleSeverity(severity)}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all duration-150',
                  isActive
                    ? clsx(config.bgColor, config.color, 'border-current/20')
                    : 'bg-slate-800 text-slate-500 border-slate-700 opacity-50 hover:opacity-75'
                )}
              >
                <span
                  className={clsx(
                    'w-2 h-2 rounded-full',
                    isActive ? config.dotColor : 'bg-slate-600'
                  )}
                />
                {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      {filteredFindings.length === 0 ? (
        <div className="text-center py-16">
          <ShieldAlert className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No findings match the current filters.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-800" />

          <div className="space-y-4">
            {filteredFindings.map((finding) => {
              const config = SEVERITY_CONFIG[finding.severity];
              return (
                <div key={finding.id} className="relative flex items-start gap-4 pl-0">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex-shrink-0 mt-5">
                    <div
                      className={clsx(
                        'w-[10px] h-[10px] rounded-full ring-4 ring-slate-950 ml-[10px]',
                        config.dotColor
                      )}
                    />
                  </div>

                  {/* Card */}
                  <div className="flex-1 min-w-0">
                    <FindingCard finding={finding} onClick={handleCardClick} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <FindingDetail
        finding={selectedFinding}
        isOpen={detailOpen}
        onClose={handleCloseDetail}
      />
    </div>
  );
};

export default FindingsTimeline;
