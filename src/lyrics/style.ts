// How the lyrics look (Customize → Lyrics style). Spicy's knobs are the web mod's ×multipliers
// (1 = the official Spicy Lyrics look) plus Rakki's own text, colour and background choices;
// Regular has its own few. Versioned like the other stores: new keys fall back to defaults.
import { create } from 'zustand';

import { readPref, writePref } from '@/lib/prefs';
import { SPICY_DEFAULTS, type SpicySettings } from '@/spicy/settings';

export interface LyricsStyle {
  spicy: SpicySettings;
  /** Text size ×. */
  spicySize: number;
  /** 'app' follows Customize → Text; 'inter' keeps Spicy's own look. */
  spicyFont: 'app' | 'inter';
  spicyColor: 'white' | 'accent';
  /** Background covers' movement × (0 = still). */
  backdropMotion: number;
  /** Background blur (0.4–1). */
  backdropBlur: number;
  /** Extra darkness over the background (0–1). */
  backdropDim: number;
  regularSize: number;
  regularAlign: 'left' | 'center';
  /** How visible the other lines are (0.2–0.9). */
  regularDim: number;
  regularColor: 'white' | 'accent';
}

export const LYRICS_STYLE_DEFAULTS: LyricsStyle = {
  spicy: SPICY_DEFAULTS,
  spicySize: 1,
  spicyFont: 'inter',
  spicyColor: 'white',
  backdropMotion: 1,
  backdropBlur: 1,
  backdropDim: 0,
  regularSize: 1,
  regularAlign: 'left',
  regularDim: 0.55,
  regularColor: 'white',
};

const VERSION = 1;
const KEY = 'rakki.lyricsStyle';
const KEYS = Object.keys(LYRICS_STYLE_DEFAULTS) as (keyof LyricsStyle)[];

function normalize(input: Partial<LyricsStyle>): LyricsStyle {
  const out = { ...LYRICS_STYLE_DEFAULTS };
  for (const k of KEYS) {
    if (k === 'spicy') continue;
    if (input[k] !== undefined && typeof input[k] === typeof LYRICS_STYLE_DEFAULTS[k]) (out as Record<string, unknown>)[k] = input[k];
  }
  const spicy = { ...SPICY_DEFAULTS };
  for (const k of Object.keys(SPICY_DEFAULTS) as (keyof SpicySettings)[]) {
    const v = input.spicy?.[k];
    if (v !== undefined && typeof v === typeof SPICY_DEFAULTS[k]) (spicy as Record<string, unknown>)[k] = v;
  }
  out.spicy = spicy;
  return out;
}

function load(): LyricsStyle {
  try {
    const raw = JSON.parse(readPref(KEY) ?? 'null') as (Partial<LyricsStyle> & { _v?: number }) | null;
    return raw && raw._v === VERSION ? normalize(raw) : LYRICS_STYLE_DEFAULTS;
  } catch {
    return LYRICS_STYLE_DEFAULTS;
  }
}

interface LyricsStyleState extends LyricsStyle {
  set<K extends keyof LyricsStyle>(key: K, value: LyricsStyle[K]): void;
  setSpicy<K extends keyof SpicySettings>(key: K, value: SpicySettings[K]): void;
  resetSpicy(): void;
  resetRegular(): void;
}

function persist(s: LyricsStyle) {
  const out: Record<string, unknown> = { _v: VERSION };
  for (const k of KEYS) out[k] = s[k];
  writePref(KEY, JSON.stringify(out));
}

export const useLyricsStyle = create<LyricsStyleState>((set, get) => ({
  ...load(),
  set(key, value) {
    set({ [key]: value } as Pick<LyricsStyle, typeof key>);
    persist(get());
  },
  setSpicy(key, value) {
    set({ spicy: { ...get().spicy, [key]: value } });
    persist(get());
  },
  resetSpicy() {
    const d = LYRICS_STYLE_DEFAULTS;
    set({
      spicy: d.spicy,
      spicySize: d.spicySize,
      spicyFont: d.spicyFont,
      spicyColor: d.spicyColor,
      backdropMotion: d.backdropMotion,
      backdropBlur: d.backdropBlur,
      backdropDim: d.backdropDim,
    });
    persist(get());
  },
  resetRegular() {
    const d = LYRICS_STYLE_DEFAULTS;
    set({ regularSize: d.regularSize, regularAlign: d.regularAlign, regularDim: d.regularDim, regularColor: d.regularColor });
    persist(get());
  },
}));
