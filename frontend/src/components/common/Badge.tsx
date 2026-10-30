import React from 'react';
import { clsx } from 'clsx';

type BadgeVariant =
  | 'info'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'passive'
  | 'active'
  | 'exploit'
  | 'lateral'
  | 'draft'
  | 'success'
  | 'warning'
  | 'danger'
  | 'default';

const variantClasses: Record<BadgeVariant, string> = {
  info: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/10 text-red-400 border-red-500/30',
  passive: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  active: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  exploit: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  lateral: 'bg-red-500/10 text-red-400 border-red-500/30',
  draft: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  success: 'bg-green-500/10 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  danger: 'bg-red-500/10 text-red-400 border-red-500/30',
  default: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, className, size = 'sm' }) => {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium border rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
};

export default Badge;
