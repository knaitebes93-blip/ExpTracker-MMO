import { contextBridge, ipcRenderer } from 'electron';
import { Settings, RegionType } from './types';

const isRegionSelector = process.argv.includes('--region-selector');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
  setSettings: (partial: Partial<Settings>) => ipcRenderer.invoke('settings:set', partial) as Promise<Settings>,
  getSessions: () => ipcRenderer.invoke('sessions:get'),
  selectRegion: (type: RegionType) => ipcRenderer.invoke('select-region', type),
  toggleOverlay: () => ipcRenderer.invoke('toggle-overlay'),
  forceCapture: () => ipcRenderer.invoke('force-capture'),
  onUpdate: (callback: (payload: any) => void) => {
    ipcRenderer.removeAllListeners('state:update');
    ipcRenderer.on('state:update', (_event, payload) => callback(payload));
  }
});

if (isRegionSelector) {
  contextBridge.exposeInMainWorld('regionSelector', {
    submit: (region: any) => ipcRenderer.send('region-selector:complete', region),
    cancel: () => ipcRenderer.send('region-selector:cancel')
  });
}
