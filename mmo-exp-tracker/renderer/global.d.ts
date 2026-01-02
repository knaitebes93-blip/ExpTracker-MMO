import { Settings } from '../electron/types';

declare global {
  interface Window {
    api: {
      getSettings: () => Promise<Settings>;
      setSettings: (partial: Partial<Settings>) => Promise<Settings>;
      getSessions: () => Promise<any>;
      selectRegion: (type: 'zone' | 'level' | 'exp') => Promise<any>;
      toggleOverlay: () => Promise<void>;
      forceCapture: () => Promise<void>;
      onUpdate: (callback: (payload: any) => void) => void;
    };
    regionSelector?: {
      submit: (region: any) => void;
      cancel: () => void;
    };
  }
}

export {};
