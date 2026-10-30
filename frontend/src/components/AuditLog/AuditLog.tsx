import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, ScrollText, SlidersHorizontal, Loader2, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { AuditEntry } from '../../types';
import AuditEntryRow from './AuditEntry';
import api from '../../services/api';

const RESOURCE_TYPES = ['All', 'engagement', 'approval', 'operation', 'finding', 'session', 'report', 'user', 'api_key'];
const PAGE_SIZE = 8;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const AuditLog: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalEntries, setTotalEntries] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchEntries = useCallback(() => {
    setLoading(true);
    setError(null);

    const params: Record<string, string> = {};
    if (searchQuery) params.search = searchQuery;
    if (resourceTypeFilter !== 'All') params.resource_type = resourceTypeFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    params.page = String(currentPage);
    params.per_page = String(PAGE_SIZE);

    api.getAuditLog(params)
      .then((res: any) => {
        const items = res.items || res || [];
        setEntries(Array.isArray(items) ? items : []);
        if (typeof res.total === 'number') {
          setTotalEntries(res.total);
        } else {
          setTotalEntries(Array.isArray(items) ? items.length : 0);
        }
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load audit log');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [searchQuery, resourceTypeFilter, dateFrom, dateTo, currentPage]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Client-side filtering fallback: if the API returns all entries
  // (no server-side filtering), apply filters locally.
  const filteredEntries = useMemo(() => {
    // If we sent filter params to the API and got a paginated response
    // with a total, trust the server's filtering.
    if (totalEntries > 0 && totalEntries !== entries.length) {
      return entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // Otherwise, apply client-side filtering as fallback
    const q = searchQuery.toLowerCase();
    return entries.filter((entry) => {
      if (
        q &&
        !entry.actor_name.toLowerCase().includes(q) &&
        !entry.action.toLowerCase().includes(q) &&
        !entry.resource_id.toLowerCase().includes(q) &&
        !entry.resource_type.toLowerCase().includes(q) &&
        !entry.ip_address.includes(q)
      ) {
        return false;
      }
      if (resourceTypeFilter !== 'All' && entry.resource_type !== resourceTypeFilter) {
        return false;
      }
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (new Date(entry.created_at) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(entry.created_at) > to) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [entries, searchQuery, resourceTypeFilter, dateFrom, dateTo, totalEntries]);

  // Determine if we need client-side pagination
  const serverPaginated = totalEntries > 0 && totalEntries !== entries.length;
  const effectiveTotal = serverPaginated ? totalEntries : filteredEntries.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  // For client-side pagination fallback
  const paginatedEntries = serverPaginated
    ? filteredEntries
    : filteredEntries.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  // Reset to page 1 when filters change
  const handleFilterChange = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (val: T) => {
    setter(val);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <ScrollText className="w-6 h-6 text-indigo-400" />
          Audit Log
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          {effectiveTotal} entr{effectiveTotal !== 1 ? 'ies' : 'y'} recorded
        </p>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Filters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleFilterChange(setSearchQuery)(e.target.value)}
              placeholder="Search by actor, action, resource, IP..."
              className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
            />
          </div>

          {/* Resource type */}
          <div>
            <select
              value={resourceTypeFilter}
              onChange={(e) => handleFilterChange(setResourceTypeFilter)(e.target.value)}
              className="w-full py-2 px-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 appearance-none"
            >
              {RESOURCE_TYPES.map((rt) => (
                <option key={rt} value={rt}>
                  {rt === 'All' ? 'All Resource Types' : rt.charAt(0).toUpperCase() + rt.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleFilterChange(setDateFrom)(e.target.value)}
              className="flex-1 py-2 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
              placeholder="From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleFilterChange(setDateTo)(e.target.value)}
              className="flex-1 py-2 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
              placeholder="To"
            />
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
          <p className="text-sm text-slate-400">Loading audit log...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16">
          <ScrollText className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchEntries}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-400 bg-indigo-500/10 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Actor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Resource
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {paginatedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <ScrollText className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No audit entries match the current filters.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedEntries.map((entry) => (
                    <AuditEntryRow key={entry.id} entry={entry} />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {effectiveTotal > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700 bg-slate-800/30">
              <p className="text-xs text-slate-500">
                Showing {(safeCurrentPage - 1) * PAGE_SIZE + 1}
                {' '}-{' '}
                {Math.min(safeCurrentPage * PAGE_SIZE, effectiveTotal)} of{' '}
                {effectiveTotal} entries
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className={clsx(
                    'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                    safeCurrentPage <= 1
                      ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-slate-100'
                  )}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>

                <span className="text-xs text-slate-400 px-2">
                  Page {safeCurrentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className={clsx(
                    'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                    safeCurrentPage >= totalPages
                      ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-slate-100'
                  )}
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditLog;
