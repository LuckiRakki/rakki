// The user's appearance choices (docs/FRAMEWORK.md §5, "In-depth customizer"). Every screen
// reads its colours and sizes from the theme built from these, so the Customize screen only
// edits this store and the whole app follows live. Versioned like the web mod's Settings.ts:
// new keys fall back to their defaults, so updates never wipe your choices.
import { create } from 'zustand';

import type { FontKey } from '@/appearance/fonts';
import { readPref, writePref } from '@/lib/prefs';

export type ShelfId = 'jumpBackIn' | 'playlists' | 'artists' | 'recentlyAdded' | 'mostPlayed' | 'rediscover' | 'random';

/** Home's shelves, in their default order. */
export const SHELVES: { id: ShelfId; label: string }[] = [
  { id: 'jumpBackIn', label: 'Jump back in' },
  { id: 'playlists', label: 'Your playlists' },
  { id: 'artists', label: 'Artists you play' },
  { id: 'recentlyAdded', label: 'Recently added' },
  { id: 'mostPlayed', label: 'Most played' },
  { id: 'rediscover', label: 'Rediscover' },
  { id: 'random', label: 'Random picks' },
];

export interface Appearance {
  // ---- Colour ----
  /**
   * 'custom' = always `accent`. 'lucid' = the colour of the playing album's art, else the last
   * played album's, else `accent` (user decision, 2026-09-30).
   */
  accentMode: 'custom' | 'lucid';
  accent: string;
  /** App background: near-black, true OLED black, or near-black tinted with the accent. */
  background: 'dark' | 'oled' | 'tinted';
  /** How far cards and rows stand out from the background (×, 1 = default). */
  surfaceContrast: number;
  /** How strongly album art colours headers, the player and the mini-player (0–1). */
  artTint: number;
  // ---- Type ----
  font: FontKey;
  /** Global text size multiplier. */
  textScale: number;
  /** Big titles: heavy (extra bold) or bold. */
  titleWeight: 'heavy' | 'bold';
  // ---- Shape ----
  /** Corner roundness multiplier (0 = square). */
  roundness: number;
  /** Spacing: compact / comfortable / spacious. */
  density: 'compact' | 'comfortable' | 'spacious';
  /** Columns in album grids. */
  gridColumns: 2 | 3 | 4;
  // ---- Home ----
  /** Every shelf, in order. */
  homeOrder: ShelfId[];
  homeHidden: ShelfId[];
  quickPicks: boolean;
  greeting: boolean;
  // ---- Mini-player & tab bar ----
  miniPlayer: 'tinted' | 'solid' | 'glass';
  miniProgress: boolean;
  tabLabels: boolean;
  // ---- Now playing ----
  playerBackground: 'gradient' | 'blur' | 'solid';
  lyricsCard: boolean;
  // ---- Feel ----
  haptics: boolean;
  /** 'system' follows iOS Reduce Motion. */
  motion: 'system' | 'reduced' | 'full';
}

export const APPEARANCE_DEFAULTS: Appearance = {
  accentMode: 'custom',
  accent: '#FF6B3D',
  background: 'dark',
  surfaceContrast: 1,
  artTint: 1,
  font: 'inter',
  textScale: 1,
  titleWeight: 'heavy',
  roundness: 1,
  density: 'comfortable',
  gridColumns: 2,
  homeOrder: SHELVES.map((s) => s.id),
  homeHidden: [],
  quickPicks: true,
  greeting: true,
  miniPlayer: 'tinted',
  miniProgress: true,
  tabLabels: true,
  playerBackground: 'gradient',
  lyricsCard: true,
  haptics: true,
  motion: 'system',
};

const VERSION = 1;
const KEY = 'rakki.appearance';
const KEYS = Object.keys(APPEARANCE_DEFAULTS) as (keyof Appearance)[];

/** Fill gaps with defaults and keep every known shelf in the order (new ones go last). */
export function normalizeAppearance(input: Partial<Appearance>): Appearance {
  const merged = { ...APPEARANCE_DEFAULTS };
  for (const k of KEYS) {
    if (input[k] !== undefined && typeof input[k] === typeof APPEARANCE_DEFAULTS[k]) {
      (merged as Record<string, unknown>)[k] = input[k];
    }
  }
  const known = new Set(SHELVES.map((s) => s.id));
  const order = merged.homeOrder.filter((id) => known.has(id));
  for (const s of SHELVES) if (!order.includes(s.id)) order.push(s.id);
  merged.homeOrder = order;
  merged.homeHidden = merged.homeHidden.filter((id) => known.has(id));
  return merged;
}

function load(): Appearance {
  try {
    const raw = readPref(KEY);
    if (!raw) return APPEARANCE_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Appearance> & { _v?: number };
    if (parsed._v !== VERSION) return APPEARANCE_DEFAULTS;
    return normalizeAppearance(parsed);
  } catch {
    return APPEARANCE_DEFAULTS;
  }
}

function pick(a: Appearance): Appearance {
  const out = {} as Record<string, unknown>;
  for (const k of KEYS) out[k] = a[k];
  return out as unknown as Appearance;
}

function persist(a: Appearance) {
  writePref(KEY, JSON.stringify({ _v: VERSION, ...pick(a) }));
}

interface AppearanceState extends Appearance {
  set<K extends keyof Appearance>(key: K, value: Appearance[K]): void;
  /** Set several at once (presets, import, section reset). */
  apply(values: Partial<Appearance>): void;
  reset(): void;
}

export const useAppearance = create<AppearanceState>((set, get) => ({
  ...load(),
  set(key, value) {
    set({ [key]: value } as Pick<Appearance, typeof key>);
    persist(get());
  },
  apply(values) {
    set(normalizeAppearance({ ...pick(get()), ...values }));
    persist(get());
  },
  reset() {
    set({ ...APPEARANCE_DEFAULTS });
    persist(APPEARANCE_DEFAULTS);
  },
}));

/** The current choices as a plain object (export). */
export function currentAppearance(): Appearance {
  return pick(useAppearance.getState());
}
