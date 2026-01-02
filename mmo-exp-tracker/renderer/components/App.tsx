import React, { useEffect, useMemo, useState } from 'react';
import SessionTable from './SessionTable';
import { Settings } from '../../electron/types';

type UiState = {
  settings: Settings | null;
  lastGoodRead?: any;
  sessions: any;
  overlayVisible: boolean;
  nextCaptureTs: number | null;
  activeSessionStats?: {
    expPerHour: number | null;
    records: any[];
  };
};

const App: React.FC = () => {
  const [state, setState] = useState<UiState>({
    settings: null,
    sessions: {},
    overlayVisible: false,
    nextCaptureTs: null
  });

  useEffect(() => {
    (async () => {
      const settings = await window.api.getSettings();
      const sessions = await window.api.getSessions();
      setState((prev) => ({ ...prev, settings, sessions }));
    })();
    window.api.onUpdate((payload) => {
      setState((prev) => ({ ...prev, ...payload }));
    });
  }, []);

  const handleIntervalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value) || 0;
    window.api.setSettings({ intervalMinutes: Math.max(1, value) });
  };

  const handleToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    window.api.setSettings({ autoOcrEnabled: event.target.checked });
  };

  const selectRegion = (type: 'zone' | 'level' | 'exp') => {
    window.api.selectRegion(type);
  };

  const formattedEta = useMemo(() => {
    if (!state.nextCaptureTs) return 'N/A';
    const diff = state.nextCaptureTs - Date.now();
    if (diff <= 0) return 'Now';
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }, [state.nextCaptureTs]);

  const expPerHour = state.activeSessionStats?.expPerHour ?? null;
  const timeToFull = useMemo(() => {
    if (!expPerHour || !state.lastGoodRead) return null;
    const remaining = 100 - state.lastGoodRead.expPercent;
    if (remaining <= 0) return 0;
    return remaining / expPerHour;
  }, [expPerHour, state.lastGoodRead]);

  return (
    <div className="app-container">
      <div className="card">
        <h1>MMO EXP Tracker</h1>
        <div className="controls">
          <label>
            Interval (minutes)
            <input
              type="number"
              min={1}
              value={state.settings?.intervalMinutes ?? 5}
              onChange={handleIntervalChange}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={state.settings?.autoOcrEnabled ?? false}
              onChange={handleToggle}
            />
            Auto OCR
          </label>
          <button onClick={() => selectRegion('zone')}>Select Zone Region</button>
          <button onClick={() => selectRegion('level')}>Select Level Region</button>
          <button onClick={() => selectRegion('exp')}>Select EXP Region</button>
          <button className="secondary" onClick={() => window.api.forceCapture()}>
            Force Capture (Ctrl+Shift+R)
          </button>
          <button className="secondary" onClick={() => window.api.toggleOverlay()}>
            {state.overlayVisible ? 'Hide Overlay' : 'Show Overlay'}
          </button>
        </div>
      </div>

      <div className="card status">
        <div className="item">
          <strong>Zone</strong>
          <span>{state.lastGoodRead?.zone ?? 'Unknown'}</span>
        </div>
        <div className="item">
          <strong>Level</strong>
          <span>{state.lastGoodRead?.level ?? 'N/A'}</span>
        </div>
        <div className="item">
          <strong>EXP %</strong>
          <span>{state.lastGoodRead?.expPercent?.toFixed?.(2) ?? 'N/A'}</span>
        </div>
        <div className="item">
          <strong>EXP / hr</strong>
          <span>{expPerHour ? `${expPerHour.toFixed(2)}%` : 'N/A'}</span>
        </div>
        <div className="item">
          <strong>Next Capture</strong>
          <span>{formattedEta}</span>
        </div>
        <div className="item">
          <strong>Time to 100%</strong>
          <span>{timeToFull ? `${timeToFull.toFixed(2)} hours` : 'N/A'}</span>
        </div>
      </div>

      <div className="card">
        <h2>Sessions</h2>
        <SessionTable sessions={state.sessions} />
      </div>
    </div>
  );
};

export default App;
