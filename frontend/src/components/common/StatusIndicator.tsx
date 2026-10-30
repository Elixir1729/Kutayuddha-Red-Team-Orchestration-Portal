import React from 'react';
import { clsx } from 'clsx';

interface StatusIndicatorProps {
  status: 'active' | 'pending' | 'executing' | 'failed' | 'completed' | 'inactive' | 'blocked';
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<string, { dotColor: string; label: string; animate?: boolean }> = {
  active: { dotColor: 'bg-green-400', label: 'Active' },
  pending: { dotColor: 'bg-yellow-400', label: 'Pending' },
  executing: { dotColor: 'bg-blue-400', label: 'Executing', animate: true },
  failed: { dotColor: 'bg-red-400', label: 'Failed' },
  completed: { dotColor: 'bg-green-400', label: 'Completed' },
  inactive: { dotColor: 'bg-slate-400', label: 'Inactive' },
  blocked: { dotColor: 'bg-red-400', label: 'Blocked' },
};

const sizeConfig = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, label, size = 'md' }) => {
  const config = statusConfig[status] || statusConfig.inactive;
  const displayLabel = label || config.label;

  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex">
        <span
          className={clsx(
            sizeConfig[size],
            config.dotColor,
            'rounded-full',
            config.animate && 'animate-pulse'
          )}
        />
        {config.animate && (
          <span
            className={clsx(
              'absolute inset-0 rounded-full animate-ping opacity-40',
              config.dotColor
            )}
          />
        )}
      </span>
      <span className="text-sm text-slate-600 dark:text-slate-300">{displayLabel}</span>
    </span>
  );
};

export default StatusIndicator;
