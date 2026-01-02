import React, { useEffect, useMemo, useState } from 'react';

interface Payload {
  lastGoodRead?: {
    zone: string;
    level: number;
    expPercent: number;
    timestamp: number;
  };
  nextCaptureTs: number | null;
  activeSessionStats?: {
    expPerHour: number | null;
    records: any[];
  };
}

const Overlay: React.FC = () => {
  const [payload, setPayload] = useState<Payload>({ nextCaptureTs: null });

  useEffect(() => {
    window.api.onUpdate((data) => setPayload(data));
  }, []);

  const eta = useMemo(() => {
    if (!payload.nextCaptureTs) return 0;
    const diff = payload.nextCaptureTs - Date.now();
    return Math.max(0, diff);
  }, [payload.nextCaptureTs]);

  const progressWidth = useMemo(() => {
    if (!payload.nextCaptureTs || !payload.lastGoodRead) return 0;
    const settingsInterval = payload.nextCaptureTs - payload.lastGoodRead.timestamp;
    if (settingsInterval <= 0) return 0;
    const elapsed = Date.now() - payload.lastGoodRead.timestamp;
    return Math.min(100, Math.max(0, (elapsed / settingsInterval) * 100));
  }, [payload.nextCaptureTs, payload.lastGoodRead]);

  const expPerHour = payload.activeSessionStats?.expPerHour;

  return (
    <div className="overlay-container">
      <div><strong>{payload.lastGoodRead?.zone ?? 'Zone'}</strong></div>
      <div>
        Lv. {payload.lastGoodRead?.level ?? '--'} | EXP {payload.lastGoodRead?.expPercent?.toFixed?.(2) ?? '--'}%
      </div>
      <div>EXP/h: {expPerHour ? `${expPerHour.toFixed(2)}%` : '--'}</div>
      <div className="progress-bar">
        <div className="progress-bar-inner" style={{ width: `${progressWidth}%` }} />
      </div>
      <div className="small-text">
        Next capture in {Math.round(eta / 1000)}s
      </div>
    </div>
  );
};

export default Overlay;
