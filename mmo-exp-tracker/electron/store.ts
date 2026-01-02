import Store from 'electron-store';
import { OcrRead, Region, RegionType, Settings } from './types';

export interface SessionsStore {
  [zone: string]: {
    [level: string]: OcrRead[];
  };
}

export interface TrackerStoreData {
  settings: Settings;
  sessions: SessionsStore;
  state: {
    lastGoodRead?: OcrRead;
  };
}

const defaultSettings: Settings = {
  intervalMinutes: 5,
  autoOcrEnabled: false,
  regions: {}
};

class Persistence extends Store<TrackerStoreData> {
  constructor() {
    super({
      name: 'mmo-exp-tracker',
      defaults: {
        settings: defaultSettings,
        sessions: {},
        state: {}
      }
    });
  }

  getSettings(): Settings {
    const stored = this.get('settings');
    return {
      ...defaultSettings,
      ...stored,
      regions: stored?.regions ?? {}
    };
  }

  setSettings(partial: Partial<Settings>): Settings {
    const next = { ...this.getSettings(), ...partial, regions: { ...this.getSettings().regions, ...partial.regions } };
    this.set('settings', next);
    return next;
  }

  getSessions(): SessionsStore {
    return this.get('sessions');
  }

  setSessions(sessions: SessionsStore): SessionsStore {
    this.set('sessions', sessions);
    return sessions;
  }

  updateLastGoodRead(read?: OcrRead): void {
    this.set('state', { ...this.get('state'), lastGoodRead: read });
  }

  getLastGoodRead(): OcrRead | undefined {
    return this.get('state').lastGoodRead;
  }

  addRecord(record: OcrRead): void {
    const sessions = this.getSessions();
    const zoneKey = normalizeZone(record.zone);
    const levelKey = String(record.level);

    const zoneGroup = sessions[zoneKey] ?? {};
    const levelGroup = zoneGroup[levelKey] ?? [];
    levelGroup.push(record);
    zoneGroup[levelKey] = levelGroup;
    sessions[zoneKey] = zoneGroup;
    this.setSessions(sessions);
    this.updateLastGoodRead(record);
  }
}

export function normalizeZone(zone: string): string {
  return zone.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const store = new Persistence();
