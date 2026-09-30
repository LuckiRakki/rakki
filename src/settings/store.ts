import { create } from 'zustand';

import { readPref, writePref } from '@/lib/prefs';

/** Max streaming bitrate in kbps; 0 = original file (direct play whenever iOS can). */
export type Bitrate = 0 | 320 | 256 | 192 | 128 | 96;

export const BITRATE_OPTIONS: { value: Bitrate; label: string; detail: string }[] = [
  { value: 0, label: 'Original', detail: 'Lossless when the file is lossless' },
  { value: 320, label: 'Very high', detail: '320 kbps AAC' },
  { value: 256, label: 'High', detail: '256 kbps AAC' },
  { value: 192, label: 'Normal', detail: '192 kbps AAC' },
  { value: 128, label: 'Low', detail: '128 kbps AAC' },
  { value: 96, label: 'Data saver', detail: '96 kbps AAC' },
];

/** Spicy = the full word-by-word engine (default, the focus). Regular = clean line by line. */
export type LyricsMode = 'spicy' | 'regular';

interface Settings {
  wifiBitrate: Bitrate;
  cellularBitrate: Bitrate;
  lyricsMode: LyricsMode;
}

// Bump when a default changes in a way that should reset stored values (like the web mod's _v).
// New keys don't need a bump: missing keys fall back to their defaults.
const VERSION = 1;
const KEY = 'rakki.settings';
const DEFAULTS: Settings = { wifiBitrate: 0, cellularBitrate: 256, lyricsMode: 'spicy' };

function load(): Settings {
  try {
    const raw = readPref(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings> & { _v?: number };
    if (parsed._v !== VERSION) return DEFAULTS;
    const merged = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
      if (parsed[k] !== undefined) (merged as Record<string, unknown>)[k] = parsed[k];
    }
    return merged;
  } catch {
    return DEFAULTS;
  }
}

interface SettingsState extends Settings {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  set(key, value) {
    set({ [key]: value } as Pick<Settings, typeof key>);
    const state = get();
    const out: Record<string, unknown> = { _v: VERSION };
    for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) out[k] = state[k];
    writePref(KEY, JSON.stringify(out));
  },
}));
