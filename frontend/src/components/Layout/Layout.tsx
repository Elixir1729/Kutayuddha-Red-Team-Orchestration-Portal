import React, { useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import useWebSocket from '../../hooks/useWebSocket';
import { WebSocketEvent } from '../../types';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/engagements': 'Engagements',
  '/engagements/new': 'New Engagement',
  '/approvals': 'Approval Queue',
  '/findings': 'Findings',
  '/audit': 'Audit Log',
};

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [killSwitchActive, setKillSwitchActive] = useState(false);

  const handleWsEvent = useCallback((event: WebSocketEvent) => {
    if (event.type === 'kill_switch_activated') {
      setKillSwitchActive(true);
    }
  }, []);

  const { isConnected } = useWebSocket(handleWsEvent);

  const title = routeTitles[location.pathname] || 'Red Team Portal';

  const handleKillSwitch = () => {
    console.log('Kill switch activated');
    setKillSwitchActive(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="ml-64">
        <Header title={title} wsConnected={isConnected} onKillSwitch={handleKillSwitch} />

        {killSwitchActive && (
          <div className="bg-red-600 text-white px-6 py-3 flex items-center justify-center gap-2 text-sm font-medium">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            KILL SWITCH ACTIVE - All operations halted
          </div>
        )}

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
