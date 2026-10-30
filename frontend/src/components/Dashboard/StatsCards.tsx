import React from 'react';
import {
  Shield,
  ClipboardCheck,
  Activity,
  AlertTriangle,
} from 'lucide-react';

interface StatsCardsProps {
  activeEngagements: number;
  pendingApprovals: number;
  operationsToday: number;
  criticalFindings: number;
  loading?: boolean;
}

export const StatsCards: React.FC<StatsCardsProps> = ({
  activeEngagements,
  pendingApprovals,
  operationsToday,
  criticalFindings,
  loading = false,
}) => {
  const cards = [
    {
      label: 'Active Engagements',
      value: activeEngagements,
      icon: <Shield className="w-5 h-5" />,
      iconBg: 'bg-indigo-500/10',
      iconColor: 'text-indigo-400',
    },
    {
      label: 'Pending Approvals',
      value: pendingApprovals,
      icon: <ClipboardCheck className="w-5 h-5" />,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Operations Today',
      value: operationsToday,
      icon: <Activity className="w-5 h-5" />,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Critical Findings',
      value: criticalFindings,
      icon: <AlertTriangle className="w-5 h-5" />,
      iconBg: 'bg-red-500/10',
      iconColor: 'text-red-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((stat) => (
        <div
          key={stat.label}
          className="bg-slate-900 border border-slate-700 rounded-xl p-5 hover:bg-slate-800 hover:border-slate-600 transition-all duration-200 cursor-default group"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-400">{stat.label}</p>
              {loading ? (
                <div className="mt-2 h-9 w-16 bg-slate-700 rounded animate-pulse" />
              ) : (
                <p className="mt-2 text-3xl font-bold text-slate-50 tracking-tight">
                  {stat.value}
                </p>
              )}
            </div>
            <div
              className={`${stat.iconBg} ${stat.iconColor} p-2.5 rounded-lg group-hover:scale-110 transition-transform duration-200`}
            >
              {stat.icon}
            </div>
          </div>
          {loading ? (
            <div className="mt-3 h-4 w-24 bg-slate-700 rounded animate-pulse" />
          ) : (
            <div className="mt-3 flex items-center gap-1.5">
              <span className="text-xs text-slate-500">--</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default StatsCards;
