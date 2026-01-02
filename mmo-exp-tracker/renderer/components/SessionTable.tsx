import React from 'react';
import { OcrRead } from '../../electron/types';

interface Props {
  sessions: Record<string, Record<string, OcrRead[]>>;
}

const SessionTable: React.FC<Props> = ({ sessions }) => {
  const zoneEntries = Object.entries(sessions || {});

  if (!zoneEntries.length) {
    return <div>No session data yet.</div>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Zone</th>
          <th>Level</th>
          <th>Records</th>
        </tr>
      </thead>
      <tbody>
        {zoneEntries.map(([zoneKey, levels]) =>
          Object.entries(levels).map(([level, records]) => (
            <tr key={`${zoneKey}-${level}`}>
              <td>{records[records.length - 1]?.zone ?? zoneKey}</td>
              <td>{level}</td>
              <td>{records.length}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
};

export default SessionTable;
