export type RegionType = 'zone' | 'level' | 'exp';

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  displayId: number;
}

export interface Settings {
  intervalMinutes: number;
  autoOcrEnabled: boolean;
  regions: Partial<Record<RegionType, Region>>;
}

export interface OcrRead {
  zone: string;
  level: number;
  expPercent: number;
  timestamp: number;
}
