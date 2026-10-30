import React, { useState, useEffect, useCallback } from 'react';
import { OperationStatus, ToolDomain } from '../../types';
import { OPERATION_STATUS_CONFIG, TOOL_DOMAIN_LABELS } from '../../utils/constants';
import { formatRelativeTime } from '../../utils/formatters';
import { Badge } from '../common/Badge';
import { Radio, RefreshCw, Inbox } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import useWebSocket from '../../hooks/useWebSocket';

interface LiveOperation {
  id: string;
  actionType?: string;
  action_type?: string;
  target: string;
  toolDomain?: ToolDomain;
  tool_domain?: ToolDomain;
  status: OperationStatus;
  createdAt?: string;
  created_at?: string;
}

const domainBadgeVariant: Record<ToolDomain, 'info' | 'low' | 'medium' | 'high'> = {
  [ToolDomain.NETWORK]: 'low',
  [ToolDomain.AD]: 'medium',
  [ToolDomain.CLOUD]: 'info',
  [ToolDomain.AI_LLM]: 'high',
};

function getField<T>(op: any, camel: string, snake: string): T {
  return op[camel] ?? op[snake];
}

export const LiveOperations: React.FC = () => {
  const [operations, setOperations] = useState<LiveOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOperations = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getOperations()
      .then((res: any) => {
        const items = res?.items || (Array.isArray(res) ? res : []);
        setOperations(items);
      })
      .catch((err: any) => setError(err.message || 'Failed to load operations'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  useWebSocket((event) => {
    if (event.type === 'operation_update' && event.data) {
      setOperations((prev) => {
        const newOp = event.data as LiveOperation;
        // If the operation already exists, update it in place
        const existingIndex = prev.findIndex((op) => op.id === newOp.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = newOp;
          return updated;
        }
        // Otherwise prepend
        return [newOp, ...prev];
      });
    }
  });

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700">
          <Radio className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Live Operations</h3>
        </div>
        <div className="flex items-center justify-center py-16">
          <span className="animate-spin w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700">
          <Radio className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Live Operations</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-red-400 mb-3">{error}</p>
          <button
            onClick={fetchOperations}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/20 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (operations.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700">
          <Radio className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Live Operations</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Inbox className="w-8 h-8 text-slate-600 mb-3" />
          <p className="text-sm text-slate-500">No operations yet</p>
          <p className="text-xs text-slate-600 mt-1">Operations will appear here as they execute.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700">
        <Radio className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-slate-200">Live Operations</h3>
        <span className="ml-auto text-xs text-slate-500">
          {operations.length} recent
        </span>
      </div>
      <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-800">
        {operations.map((op) => {
          const actionType = getField<string>(op, 'actionType', 'action_type');
          const toolDomain = getField<ToolDomain>(op, 'toolDomain', 'tool_domain');
          const createdAt = getField<string>(op, 'createdAt', 'created_at');
          const statusCfg = OPERATION_STATUS_CONFIG[op.status];
          if (!statusCfg) return null;
          return (
            <div
              key={op.id}
              className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/60 transition-colors duration-150"
            >
              {/* Status dot */}
              <span className="relative flex shrink-0">
                <span
                  className={clsx('w-2.5 h-2.5 rounded-full', statusCfg.dotColor)}
                />
                {statusCfg.animate && (
                  <span
                    className={clsx(
                      'absolute inset-0 rounded-full animate-ping opacity-40',
                      statusCfg.dotColor
                    )}
                  />
                )}
              </span>

              {/* Action + target */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {actionType}
                </p>
                <p className="text-xs text-slate-400 truncate">{op.target}</p>
              </div>

              {/* Domain badge */}
              {toolDomain && domainBadgeVariant[toolDomain] && (
                <Badge variant={domainBadgeVariant[toolDomain]} size="sm">
                  {TOOL_DOMAIN_LABELS[toolDomain]}
                </Badge>
              )}

              {/* Status label */}
              <span
                className={clsx(
                  'text-xs font-medium whitespace-nowrap w-28 text-right',
                  statusCfg.color
                )}
              >
                {statusCfg.label}
              </span>

              {/* Relative time */}
              {createdAt && (
                <span className="text-xs text-slate-500 w-16 text-right shrink-0">
                  {formatRelativeTime(createdAt)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LiveOperations;
