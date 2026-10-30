import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { AuditEntry as AuditEntryType } from '../../types';
import { formatDate } from '../../utils/formatters';

interface AuditEntryProps {
  entry: AuditEntryType;
}

const actionColorMap: Record<string, string> = {
  engagement_created: 'text-green-400',
  approval_granted: 'text-green-400',
  approval_denied: 'text-red-400',
  operation_started: 'text-blue-400',
  operation_completed: 'text-green-400',
  operation_failed: 'text-red-400',
  kill_switch_activated: 'text-red-400',
  finding_created: 'text-orange-400',
  user_login: 'text-indigo-400',
  user_logout: 'text-slate-400',
  scope_modified: 'text-yellow-400',
  report_exported: 'text-indigo-400',
  permission_changed: 'text-yellow-400',
  session_started: 'text-blue-400',
  api_key_rotated: 'text-yellow-400',
};

const formatAction = (action: string): string => {
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const AuditEntryRow: React.FC<AuditEntryProps> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const actionColor = actionColorMap[entry.action] ?? 'text-slate-400';

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className={clsx(
          'cursor-pointer transition-colors duration-100',
          expanded ? 'bg-slate-800/60' : 'hover:bg-slate-800/40'
        )}
      >
        <td className="px-4 py-3 text-xs text-slate-400 font-mono whitespace-nowrap">
          {formatDate(entry.created_at)}
        </td>
        <td className="px-4 py-3 text-sm text-slate-200 whitespace-nowrap">
          {entry.actor_name}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={clsx('text-sm font-medium', actionColor)}>
            {formatAction(entry.action)}
          </span>
        </td>
        <td className="px-4 py-3 text-sm whitespace-nowrap">
          <span className="text-slate-400">{entry.resource_type}</span>
          <span className="text-slate-600 mx-1">/</span>
          <span className="text-slate-300 font-mono text-xs">{entry.resource_id}</span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
          {entry.ip_address}
        </td>
        <td className="px-4 py-3 text-slate-500 w-8">
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-800/40">
          <td colSpan={6} className="px-4 py-3">
            <div className="ml-4">
              <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">
                Details
              </p>
              <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-800/70 border-b border-slate-700">
                  <span className="text-xs text-slate-500 font-mono">JSON</span>
                </div>
                <pre className="p-3 text-xs text-slate-300 font-mono overflow-x-auto leading-relaxed max-h-48 overflow-y-auto">
                  {JSON.stringify(entry.details, null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default AuditEntryRow;
