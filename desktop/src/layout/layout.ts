// What's open around the main area and how wide things are (remembered between launches).
import { getCurrentWindow } from '@tauri-apps/api/window';
import { create } from 'zustand';

import { inTauri } from '~/lib/tauri';

export const win = inTauri ? getCurrentWindow() : null;

export type Panel = 'now' | 'queue';
export type PlayerTab = 'queue' | 'related' | 'lyrics';

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

interface LayoutState {
  /** The right sidebar: Now Playing (cover, lyrics card, credits, next up) or the whole queue. */
  panel: Panel | null;
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
  panel: read<Panel | null>('rakki.panel2', 'now'),
  sidebarWidth: read('rakki.sidebarWidth', SIDEBAR.default),
  panelWidth: read('rakki.panelWidth', PANEL.default),
  nowPlaying: false,
  playerTab: read<PlayerTab>('rakki.playerTab', 'lyrics'),
  fullscreen: false,
  mini: false,
  miniOnTop: read('rakki.miniOnTop', true),
  setPanel(panel) {
    save('rakki.panel2', panel);
    set({ panel });
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
