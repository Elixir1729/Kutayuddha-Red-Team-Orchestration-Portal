import React, { useState } from 'react';
import { OctagonX, AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import api from '../../services/api';
import useWebSocket from '../../hooks/useWebSocket';

interface KillSwitchProps {
  onActivate: () => void;
  engagementId?: string;
}

export const KillSwitch: React.FC<KillSwitchProps> = ({ onActivate, engagementId }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  // Subscribe to kill_switch_activated WebSocket events
  useWebSocket((event) => {
    if (event.type === 'kill_switch_activated') {
      setKillSwitchActive(true);
    }
  });

  const handleActivate = async () => {
    setConfirming(true);
    setActivateError(null);

    try {
      if (engagementId) {
        await api.activateKillSwitch(engagementId);
      }
      onActivate();
      setKillSwitchActive(true);
      setTimeout(() => {
        setConfirming(false);
        setShowConfirm(false);
        setConfirmText('');
      }, 2000);
    } catch (err: any) {
      setActivateError(err.message || 'Failed to activate kill switch');
      setConfirming(false);
    }
  };

  return (
    <>
      {/* Persistent banner when kill switch is active */}
      {killSwitchActive && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold">
          <OctagonX className="w-4 h-4" />
          KILL SWITCH ACTIVE - All operations halted
        </div>
      )}

      <button
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all hover:shadow-lg hover:shadow-red-900/30 active:scale-95"
      >
        <OctagonX className="w-4 h-4" />
        <span className="hidden sm:inline">Kill Switch</span>
      </button>

      <Modal
        isOpen={showConfirm}
        onClose={() => {
          if (!confirming) {
            setShowConfirm(false);
            setConfirmText('');
            setActivateError(null);
          }
        }}
        title="Activate Kill Switch"
        size="sm"
        footer={
          <>
            <button
              onClick={() => {
                setShowConfirm(false);
                setConfirmText('');
                setActivateError(null);
              }}
              className="btn-secondary"
              disabled={confirming}
            >
              Cancel
            </button>
            <button
              onClick={handleActivate}
              disabled={confirmText !== 'KILL' || confirming}
              className="btn-danger disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {confirming ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Activating...
                </>
              ) : (
                <>
                  <OctagonX className="w-4 h-4" />
                  Activate Kill Switch
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-400">This will immediately halt ALL active operations.</p>
              <p className="text-sm text-slate-400 mt-1">
                All running tools will be terminated, pending operations cancelled, and the engagement will be marked as aborted.
                This action is logged and cannot be undone.
              </p>
            </div>
          </div>

          {activateError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{activateError}</p>
            </div>
          )}

          <div>
            <label className="input-label">
              Type <span className="font-mono font-bold text-red-400">KILL</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input-field font-mono"
              placeholder="Type KILL"
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </>
  );
};

export default KillSwitch;
