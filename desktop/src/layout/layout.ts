// What's open around the main area and how wide things are (remembered between launches).
import { getCurrentWindow } from '@tauri-apps/api/window';
import { create } from 'zustand';

import { inTauri } from '~/lib/tauri';
import { kv } from '~/lib/kv';

export const win = inTauri ? getCurrentWindow() : null;

const onLinux = typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);

/** Whether the window was maximized before full screen, to put it back that way after. */
let wasMaximized = false;
/** The window changing size on its own for a moment: the full screen check waits for it. */
let changingUntil = 0;

/**
 * Full screen edge to edge. Rakki's window has no Windows frame, but keeps its invisible resize
 * border and shadow, which in full screen left a dark strip down the sides and along the bottom.
 * On Windows both are off while full screen is on. On Linux they stay: a window that can't be
 * resized is a floating one to Hyprland and other tiling desktops, which then didn't fill the
 * screen. Leaving full screen puts a maximized window back to maximized.
 */
async function fillScreen(on: boolean) {
  if (!win) return;
  changingUntil = Date.now() + 1500;
  try {
    if (on) {
      if (await win.isFullscreen()) return;
      wasMaximized = await win.isMaximized().catch(() => false);
      if (!onLinux) {
        await win.setShadow(false);
        await win.setResizable(false);
      }
      await win.setFullscreen(true);
    } else {
      await win.setFullscreen(false);
      if (!onLinux) {
        await win.setResizable(true);
        await win.setShadow(true);
      }
      if (wasMaximized && !(await win.isMaximized())) await win.maximize();
      wasMaximized = false;
    }
  } catch {
    // The window can't change: it stays as it was.
  } finally {
    changingUntil = Date.now() + 600;
  }
}

/** Out of full screen, waiting until the window is back (the mini player measures it after). */
export async function leaveFullscreen() {
  if (!useLayout.getState().fullscreen) return;
  useLayout.setState({ fullscreen: false });
  await fillScreen(false);
}

/**
 * Full screen left some other way (the desktop's own key for it, Win+Down, the window manager):
 * Rakki follows, so it doesn't stay in its full screen look in a normal window, or the other way
 * round. A music video in full screen goes back to the theater.
 */
export function startFullscreenWatch() {
  if (!win) return;
  const w = win;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = () => {
    timer = null;
    const wait = changingUntil - Date.now();
    if (wait > 0) {
      timer = setTimeout(check, wait);
      return;
    }
    void w.isFullscreen().then((real) => {
      const l = useLayout.getState();
      if (real === l.fullscreen || Date.now() < changingUntil) return;
      if (real) useLayout.setState({ fullscreen: true });
      else {
        useLayout.setState({ fullscreen: false });
        if (!onLinux) void w.setResizable(true).then(() => w.setShadow(true)).catch(() => {});
        leftFullscreen.forEach((f) => f());
      }
    });
  };
  void w.onResized(() => {
    if (!timer) timer = setTimeout(check, 250);
  });
}

/** Called when the window left full screen by itself (player/video.ts: the video goes back to the theater). */
const leftFullscreen = new Set<() => void>();
export const onLeftFullscreen = (f: () => void) => (leftFullscreen.add(f), () => void leftFullscreen.delete(f));

export type Panel = 'now' | 'queue' | 'devices';
export type PlayerTab = 'queue' | 'related' | 'lyrics' | 'visualizer';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = kv.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) => kv.setItem(key, JSON.stringify(value));

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
  /** The lyrics in the main area, in place of the page (the Lyrics button, as in Spotify). */
  lyricsView: boolean;
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
  setLyricsView(open: boolean): void;
  setNowPlaying(open: boolean, tab?: PlayerTab): void;
  setPlayerTab(tab: PlayerTab): void;
  setFullscreen(on: boolean): void;
  setMiniOnTop(on: boolean): void;
  /**
   * Back to the normal window with the page showing: out of full screen and the full player
   * (the player bar's buttons on the right, layout/PlayerBar.tsx). With `page`, the lyrics in
   * the main area close too and a floating sidebar folds away (searching, TitleBar.tsx).
   */
  showMain(page?: boolean): void;
}

export const useLayout = create<LayoutState>((set, get) => ({
  panel: narrow(startWidth).floating ? null : read<Panel | null>('rakki.panel2', 'now'),
  ...narrow(startWidth),
  sidebarWidth: read('rakki.sidebarWidth', SIDEBAR.default),
  panelWidth: read('rakki.panelWidth', PANEL.default),
  lyricsView: false,
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
  setLyricsView(lyricsView) {
    set({ lyricsView });
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
    void fillScreen(on);
  },
  setMiniOnTop(miniOnTop) {
    save('rakki.miniOnTop', miniOnTop);
    set({ miniOnTop });
  },
  showMain(page) {
    const s = get();
    if (s.fullscreen) s.setFullscreen(false);
    if (s.nowPlaying) s.setNowPlaying(false);
    if (page) {
      if (s.lyricsView) s.setLyricsView(false);
      if (s.floating && s.panel) set({ panel: null });
    }
    for (const f of mainShown) f(!!page);
  },
}));

/** Others that cover the page (player/video.ts: a music video in the theater or full screen). */
const mainShown = new Set<(page: boolean) => void>();
export const onShowMain = (f: (page: boolean) => void) => (mainShown.add(f), () => void mainShown.delete(f));
