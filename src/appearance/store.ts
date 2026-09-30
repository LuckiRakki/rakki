// The user's appearance choices (docs/FRAMEWORK.md §5, "In-depth customizer"). Phase 3 lays
// the plumbing: every screen reads its colours and sizes from the theme built from these,
// so the Phase 5 Customize screen only has to edit this store for the whole app to follow
// live. Versioned like the web mod's Settings.ts: new keys fall back to their defaults.
import { create } from 'zustand';

import { readPref, writePref } from '@/lib/prefs';

export interface Appearance {
  /**
   * 'custom' = always `accent`. 'lucid' = the colour of the playing album's art, else the last
   * played album's, else `accent` (user decision, 2026-09-30).
   */
  accentMode: 'custom' | 'lucid';
  accent: string;
  /** App background: near-black, true OLED black. */
  background: 'dark' | 'oled';
  /** Global text size multiplier. */
  textScale: number;
  /** Corner roundness multiplier (0 = square). */
  roundness: number;
  /** Spacing: compact / comfortable / spacious. */
  density: 'compact' | 'comfortable' | 'spacious';
}

export const APPEARANCE_DEFAULTS: Appearance = {
  accentMode: 'custom',
  accent: '#FF6B3D',
  background: 'dark',
  textScale: 1,
  roundness: 1,
  density: 'comfortable',
};

const VERSION = 1;
const KEY = 'rakki.appearance';

function load(): Appearance {
  try {
    const raw = readPref(KEY);
    if (!raw) return APPEARANCE_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Appearance> & { _v?: number };
    if (parsed._v !== VERSION) return APPEARANCE_DEFAULTS;
    const merged = { ...APPEARANCE_DEFAULTS };
    for (const k of Object.keys(APPEARANCE_DEFAULTS) as (keyof Appearance)[]) {
      if (parsed[k] !== undefined) (merged as Record<string, unknown>)[k] = parsed[k];
    }
    return merged;
  } catch {
    return APPEARANCE_DEFAULTS;
  }
}

interface AppearanceState extends Appearance {
  set<K extends keyof Appearance>(key: K, value: Appearance[K]): void;
  reset(): void;
}

function persist(a: Appearance) {
  const out: Record<string, unknown> = { _v: VERSION };
  for (const k of Object.keys(APPEARANCE_DEFAULTS) as (keyof Appearance)[]) out[k] = a[k];
  writePref(KEY, JSON.stringify(out));
}

export const useAppearance = create<AppearanceState>((set, get) => ({
  ...load(),
  set(key, value) {
    set({ [key]: value } as Pick<Appearance, typeof key>);
    persist(get());
  },
  reset() {
    set({ ...APPEARANCE_DEFAULTS });
    persist(APPEARANCE_DEFAULTS);
  },
}));
