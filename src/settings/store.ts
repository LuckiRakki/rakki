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

/**
 * Download quality. Lossless files (FLAC, ALAC, WAV…) are converted to AAC in an .m4a for
 * High/Normal; compressed files (MP3, AAC) are always kept as they are, since converting
 * them saves little and costs quality.
 */
export type DownloadQuality = 'original' | 'high' | 'normal';

export const DOWNLOAD_QUALITY_OPTIONS: { value: DownloadQuality; label: string; detail: string }[] = [
  { value: 'original', label: 'Original', detail: 'Lossless stays lossless (about 30 MB a song)' },
  { value: 'high', label: 'High', detail: 'Lossless files as 256 kbps AAC (about 8 MB a song)' },
  { value: 'normal', label: 'Normal', detail: 'Lossless files as 128 kbps AAC (about 4 MB a song)' },
];

/** Spicy = the full word-by-word engine (default, the focus). Regular = clean line by line. */
export type LyricsMode = 'spicy' | 'regular';

/** An artist's Popular songs: by worldwide plays on Last.fm, or by your own plays. */
export type PopularSort = 'lastfm' | 'mine';

interface Settings {
  wifiBitrate: Bitrate;
  cellularBitrate: Bitrate;
  lyricsMode: LyricsMode;
  downloadQuality: DownloadQuality;
  /** Off = downloads wait for Wi-Fi. */
  downloadOnCellular: boolean;
  /** Act offline even when the server is reachable: only downloads, no data used. */
  offlineMode: boolean;
  /** Even out loudness between songs (Jellyfin's per-song NormalizationGain). */
  normalize: boolean;
  /** When the queue runs out, keep going with similar songs. */
  autoplay: boolean;
  /** The user's own Last.fm API key (worldwide play counts). Empty = not set up. */
  lastfmApiKey: string;
  popularSort: PopularSort;
}

// Bump when a default changes in a way that should reset stored values (like the web mod's _v).
// New keys don't need a bump: missing keys fall back to their defaults.
const VERSION = 1;
const KEY = 'rakki.settings';
const DEFAULTS: Settings = {
  wifiBitrate: 0,
  cellularBitrate: 256,
  lyricsMode: 'spicy',
  downloadQuality: 'original',
  downloadOnCellular: false,
  offlineMode: false,
  normalize: true,
  autoplay: true,
  lastfmApiKey: '',
  popularSort: 'lastfm',
};

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
