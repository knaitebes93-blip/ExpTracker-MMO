import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen } from 'electron';
import path from 'path';
import Tesseract from 'tesseract.js';
import { store, normalizeZone } from './store';
import { Region, RegionType, Settings, OcrRead } from './types';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let regionWindow: BrowserWindow | null = null;
let captureTimer: NodeJS.Timeout | null = null;
let nextCaptureTs: number | null = null;

function finalizeRegion(region: Partial<Region>): Region {
  const displays = screen.getAllDisplays();
  const pointX = region.x ?? 0;
  const pointY = region.y ?? 0;
  const targetDisplay =
    displays.find((d) =>
      pointX >= d.bounds.x &&
      pointX < d.bounds.x + d.bounds.width &&
      pointY >= d.bounds.y &&
      pointY < d.bounds.y + d.bounds.height
    ) ?? screen.getPrimaryDisplay();

  return {
    x: region.x ?? targetDisplay.bounds.x,
    y: region.y ?? targetDisplay.bounds.y,
    width: region.width ?? targetDisplay.workArea.width,
    height: region.height ?? targetDisplay.workArea.height,
    displayId: targetDisplay.id
  };
}

function getAssetPath(...segments: string[]): string {
  return path.join(app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, '..', 'assets'), ...segments);
}

function getRendererPath(html: string): string {
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    return `${process.env.VITE_DEV_SERVER_URL}/${html}`;
  }
  return `file://${path.join(__dirname, '..', 'renderer', html)}`;
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL(getRendererPath('index.html'));
  return win;
}

function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 280,
    height: 180,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL(getRendererPath('overlay.html'));
  return win;
}

function createRegionWindow(): BrowserWindow {
  const displays = screen.getAllDisplays();
  const minX = Math.min(...displays.map((d) => d.bounds.x));
  const minY = Math.min(...displays.map((d) => d.bounds.y));
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
  const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height));

  const win = new BrowserWindow({
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    frame: false,
    transparent: true,
    resizable: false,
    fullscreenable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: ['--region-selector']
    }
  });
  win.setIgnoreMouseEvents(false);
  win.loadURL(getRendererPath('region-selector.html'));
  return win;
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+O', () => toggleOverlayVisibility());
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
  });
  globalShortcut.register('CommandOrControl+Shift+R', () => performCapture('force'));
  globalShortcut.register('CommandOrControl+Shift+Z', () => openRegionSelection('zone'));
  globalShortcut.register('CommandOrControl+Shift+L', () => openRegionSelection('level'));
  globalShortcut.register('CommandOrControl+Shift+E', () => openRegionSelection('exp'));
}

function setupIpc() {
  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:set', (_event, partial: Partial<Settings>) => {
    const updated = store.setSettings(partial);
    restartCaptureInterval();
    broadcastUpdate();
    return updated;
  });

  ipcMain.handle('sessions:get', () => store.getSessions());
  ipcMain.handle('select-region', async (_event, type: RegionType) => {
    return openRegionSelection(type);
  });
  ipcMain.handle('toggle-overlay', () => toggleOverlayVisibility());
  ipcMain.handle('force-capture', () => performCapture('force'));

  ipcMain.on('region-selector:complete', (_event, region: Partial<Region>) => {
    if (regionWindow) {
      regionWindow.close();
      regionWindow = null;
    }
    const completedRegion = finalizeRegion(region);
    if (pendingRegionResolve) {
      pendingRegionResolve(completedRegion);
      pendingRegionResolve = null;
    }
  });

  ipcMain.on('region-selector:cancel', () => {
    if (regionWindow) {
      regionWindow.close();
      regionWindow = null;
    }
    if (pendingRegionReject) {
      pendingRegionReject(new Error('Selection canceled'));
      pendingRegionReject = null;
    }
  });
}

let pendingRegionResolve: ((region: Region) => void) | null = null;
let pendingRegionReject: ((err: Error) => void) | null = null;

async function openRegionSelection(type: RegionType): Promise<Region> {
  if (regionWindow) {
    regionWindow.focus();
    return new Promise((_res, rej) => rej(new Error('Selection already in progress')));
  }

  regionWindow = createRegionWindow();
  regionWindow.setTitle(`Select ${type} region`);
  regionWindow.show();

  return new Promise<Region>((resolve, reject) => {
    pendingRegionResolve = resolve;
    pendingRegionReject = reject;
    regionWindow?.on('closed', () => {
      regionWindow = null;
      if (pendingRegionReject) {
        pendingRegionReject(new Error('Selection canceled'));
        pendingRegionReject = null;
        pendingRegionResolve = null;
      }
    });
  }).then((region) => {
    const settings = store.getSettings();
    store.setSettings({ regions: { ...settings.regions, [type]: region } });
    broadcastUpdate();
    return region;
  });
}

function toggleOverlayVisibility() {
  if (!overlayWindow) {
    overlayWindow = createOverlayWindow();
  }
  const visible = overlayWindow.isVisible();
  if (visible) {
    overlayWindow.hide();
  } else {
    overlayWindow.show();
  }
  broadcastUpdate();
}

async function captureRegion(region: Region): Promise<nativeImage | null> {
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.find((d) => d.id === region.displayId);
  const captureDisplay = targetDisplay ?? screen.getPrimaryDisplay();
  const { width, height } = captureDisplay.size;
  const scale = captureDisplay.scaleFactor || 1;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.floor(width * scale), height: Math.floor(height * scale) }
  });
  const source = sources.find((s) => s.display_id === String(captureDisplay.id));
  if (!source) return null;

  const image = source.thumbnail;
  if (image.isEmpty()) return null;

  const cropRect = {
    x: Math.max(0, Math.floor((region.x - captureDisplay.bounds.x) * scale)),
    y: Math.max(0, Math.floor((region.y - captureDisplay.bounds.y) * scale)),
    width: Math.max(1, Math.floor(region.width * scale)),
    height: Math.max(1, Math.floor(region.height * scale))
  };

  return image.crop(cropRect);
}

async function ocrImage(image: nativeImage): Promise<string> {
  const buffer = image.toPNG();
  const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
  return result.data.text || '';
}

function parseZone(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized;
}

function parseLevel(text: string): number | null {
  const match = text.match(/(level|lv\.?|lvl\.?|lvl|lv)\s*(\d{1,3})|(\d{1,3})/i);
  const value = match ? Number(match[2] ?? match[3]) : null;
  if (!value || value < 1 || value > 999) return null;
  return value;
}

function parseExp(text: string): number | null {
  const match = text.match(/(\d{1,3}(?:\.\d+)?)\s*%?/);
  if (!match) return null;
  const value = Number(match[1]);
  if (isNaN(value) || value < 0 || value > 100) return null;
  return value;
}

function getActiveRecords(zone: string, level: number) {
  const sessions = store.getSessions();
  const zoneKey = normalizeZone(zone);
  const levelKey = String(level);
  return sessions[zoneKey]?.[levelKey] ?? [];
}

function computeExpPerHour(records: OcrRead[]): number | null {
  if (records.length < 2) return null;
  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const delta = end.expPercent - start.expPercent;
  if (delta < 0) return null;
  const hours = (end.timestamp - start.timestamp) / 3600000;
  if (hours <= 0) return null;
  return delta / hours;
}

async function performCapture(reason: 'auto' | 'force') {
  const settings = store.getSettings();
  const regions = settings.regions;
  if (!regions.zone || !regions.level || !regions.exp) {
    broadcastUpdate();
    return;
  }

  try {
    const [zoneImg, levelImg, expImg] = await Promise.all([
      captureRegion(regions.zone),
      captureRegion(regions.level),
      captureRegion(regions.exp)
    ]);

    if (!zoneImg || !levelImg || !expImg) return;

    const [zoneText, levelText, expText] = await Promise.all([
      ocrImage(zoneImg),
      ocrImage(levelImg),
      ocrImage(expImg)
    ]);

    const zone = parseZone(zoneText);
    const level = parseLevel(levelText);
    const exp = parseExp(expText);

    if (!zone || level === null || exp === null) {
      return;
    }

    const now = Date.now();
    const last = store.getLastGoodRead();
    if (last) {
      const expJump = Math.abs(exp - last.expPercent);
      if (expJump > 30 && reason === 'auto') {
        return;
      }
      if (level !== last.level && exp < last.expPercent) {
        // Level up resets exp; treat as new session implicitly by different level key
      }
    }

    const record: OcrRead = { zone, level, expPercent: exp, timestamp: now };
    store.addRecord(record);

    if (settings.autoOcrEnabled) {
      nextCaptureTs = Date.now() + settings.intervalMinutes * 60 * 1000;
    }
    broadcastUpdate();
  } catch (err) {
    console.error('Capture failed', err);
  }
}

function broadcastUpdate() {
  const settings = store.getSettings();
  const sessions = store.getSessions();
  const last = store.getLastGoodRead();
  const overlayVisible = overlayWindow?.isVisible() ?? false;
  const payload = {
    settings,
    sessions,
    lastGoodRead: last,
    overlayVisible,
    nextCaptureTs,
    activeSessionStats: undefined as
      | {
          expPerHour: number | null;
          records: OcrRead[];
        }
      | undefined
  };

  if (last) {
    const records = getActiveRecords(last.zone, last.level);
    payload.activeSessionStats = {
      expPerHour: computeExpPerHour(records),
      records
    };
  }

  [mainWindow, overlayWindow].forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('state:update', payload);
    }
  });
}

function restartCaptureInterval() {
  if (captureTimer) clearInterval(captureTimer);
  const settings = store.getSettings();
  if (!settings.autoOcrEnabled) {
    nextCaptureTs = null;
    broadcastUpdate();
    return;
  }
  const intervalMs = settings.intervalMinutes * 60 * 1000;
  nextCaptureTs = Date.now() + intervalMs;
  captureTimer = setInterval(() => performCapture('auto'), intervalMs);
  broadcastUpdate();
}

function startApp() {
  mainWindow = createMainWindow();
  overlayWindow = createOverlayWindow();
  setupIpc();
  registerShortcuts();
  restartCaptureInterval();
  broadcastUpdate();
}

app.whenReady().then(startApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow();
  }
});
