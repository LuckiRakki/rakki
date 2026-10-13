// What's open around the main area and how wide things are (remembered between launches).
import { getCurrentWindow } from '@tauri-apps/api/window';
import { create } from 'zustand';

import { inTauri } from '~/lib/tauri';

export const win = inTauri ? getCurrentWindow() : null;

export type Panel = 'now' | 'queue';
export type PlayerTab = 'queue' | 'related' | 'lyrics' | 'visualizer';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

export const SIDEBAR = { min: 200, max: 460, default: 290 };
export const PANEL = { min: 280, max: 560, default: 360 };
/** Narrower windows than this: the right sidebar floats over the page, closed until asked for. */
export const FLOAT_PANEL_BELOW = 1180;
/** Narrower than this: the left sidebar shrinks to its icons. */
export const RAIL_BELOW = 1000;

const narrow = (w: number) => ({ floating: w < FLOAT_PANEL_BELOW, rail: w < RAIL_BELOW });
const startWidth = typeof window === 'undefined' ? 1400 : window.innerWidth;

interface LayoutState {
  /** The right sidebar: Now Playing (cover, lyrics card, credits, next up) or the whole queue. */
  panel: Panel | null;
  /** A narrow window: the right sidebar floats over the page (not remembered). */
  floating: boolean;
  /** A narrower one: the left sidebar is icons only. */
  rail: boolean;
  setWindowWidth(px: number): void;
  sidebarWidth: number;
  panelWidth: number;
  /** The full player (over everything but the player bar). */
  nowPlaying: boolean;
  playerTab: PlayerTab;
  /** The window filling the screen. */
  fullscreen: boolean;
  /** The window shrunk to the mini player (layout/MiniPlayer.tsx). */
  mini: boolean;
  miniOnTop: boolean;
  setPanel(p: Panel | null): void;
  togglePanel(p: Panel): void;
  setWidth(which: 'sidebar' | 'panel', px: number): void;
  setNowPlaying(open: boolean, tab?: PlayerTab): void;
  setPlayerTab(tab: PlayerTab): void;
  setFullscreen(on: boolean): void;
  setMiniOnTop(on: boolean): void;
}

export const useLayout = create<LayoutState>((set, get) => ({
  panel: narrow(startWidth).floating ? null : read<Panel | null>('rakki.panel2', 'now'),
  ...narrow(startWidth),
  sidebarWidth: read('rakki.sidebarWidth', SIDEBAR.default),
  panelWidth: read('rakki.panelWidth', PANEL.default),
  nowPlaying: false,
  playerTab: read<PlayerTab>('rakki.playerTab', 'lyrics'),
  fullscreen: false,
  mini: false,
  miniOnTop: read('rakki.miniOnTop', true),
  setPanel(panel) {
    if (!get().floating) save('rakki.panel2', panel);
    set({ panel });
  },
  setWindowWidth(px) {
    const next = narrow(px);
    const was = get();
    if (next.floating === was.floating && next.rail === was.rail) return;
    // Floating starts closed; back to wide, the sidebar is as you left it.
    set({ ...next, ...(next.floating !== was.floating ? { panel: next.floating ? null : read<Panel | null>('rakki.panel2', 'now') } : {}) });
  },
  togglePanel(p) {
    get().setPanel(get().panel === p ? null : p);
  },
  setWidth(which, px) {
    const range = which === 'sidebar' ? SIDEBAR : PANEL;
    const w = Math.round(Math.max(range.min, Math.min(range.max, px)));
    if (which === 'sidebar') {
      save('rakki.sidebarWidth', w);
      set({ sidebarWidth: w });
    } else {
      save('rakki.panelWidth', w);
      set({ panelWidth: w });
    }
  },
  setNowPlaying(nowPlaying, tab) {
    set({ nowPlaying });
    if (tab) get().setPlayerTab(tab);
    // Leaving the player leaves full screen too.
    if (!nowPlaying && get().fullscreen) get().setFullscreen(false);
  },
  setPlayerTab(playerTab) {
    save('rakki.playerTab', playerTab);
    set({ playerTab });
  },
  setFullscreen(on) {
    set({ fullscreen: on });
    void win?.setFullscreen(on);
  },
  setMiniOnTop(miniOnTop) {
    save('rakki.miniOnTop', miniOnTop);
    set({ miniOnTop });
  },
}));
