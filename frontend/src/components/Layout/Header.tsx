import React, { useState } from 'react';
import { Bell, Wifi, WifiOff } from 'lucide-react';
import KillSwitch from '../common/KillSwitch';

interface HeaderProps {
  title: string;
  wsConnected: boolean;
  onKillSwitch: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, wsConnected, onKillSwitch }) => {
  const [notificationCount] = useState(3);

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          {wsConnected ? (
            <span className="flex items-center gap-1.5 text-green-400">
              <Wifi className="w-4 h-4" />
              <span className="hidden sm:inline">Live</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-red-400">
              <WifiOff className="w-4 h-4" />
              <span className="hidden sm:inline">Disconnected</span>
            </span>
          )}
        </div>

        <button className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors">
          <Bell className="w-5 h-5" />
          {notificationCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
              {notificationCount}
            </span>
          )}
        </button>

        <KillSwitch onActivate={onKillSwitch} />
      </div>
    </header>
  );
};

export default Header;
