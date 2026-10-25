// Keyboard shortcuts: every action has its keys, and Settings can change them (each action can
// have more than one key, or none). Only the changes are kept, so new default keys in a later
// version still arrive. Keys are written as "Ctrl+Shift+K": the modifiers in a fixed order, then
// the key, read from the key's place on the keyboard for letters and digits (so Shift+1 is
// "Shift+1", not "!").
//
// handleShortcut (main.tsx) runs them. While typing in a field only the actions marked
// `whileTyping` run, and Space on a focused button presses the button.
import { create } from 'zustand';

import { useLayout } from '~/layout/layout';
import { go, useNav } from '~/nav';
import { currentPosition, usePlayer, type RepeatMode } from '~/player/store';

export type ShortcutId =
  | 'playPause'
  | 'next'
  | 'previous'
  | 'seekForward'
  | 'seekBack'
  | 'volumeUp'
  | 'volumeDown'
  | 'mute'
  | 'shuffle'
  | 'repeat'
  | 'search'
  | 'back'
  | 'forward'
  | 'lyrics'
  | 'nowPlaying'
  | 'fullscreen'
  | 'miniPlayer'
  | 'settings'
  | 'shortcuts';

export interface ShortcutAction {
  id: ShortcutId;
  label: string;
  group: 'Playback' | 'Volume' | 'Navigation' | 'View';
  /** Also runs while typing in a field. */
  whileTyping?: boolean;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'playPause', label: 'Play / Pause', group: 'Playback' },
  { id: 'next', label: 'Next Song', group: 'Playback' },
  { id: 'previous', label: 'Previous Song', group: 'Playback' },
  { id: 'seekForward', label: 'Forward 5 Seconds', group: 'Playback' },
  { id: 'seekBack', label: 'Back 5 Seconds', group: 'Playback' },
  { id: 'shuffle', label: 'Shuffle', group: 'Playback' },
  { id: 'repeat', label: 'Repeat', group: 'Playback' },
  { id: 'volumeUp', label: 'Volume Up', group: 'Volume' },
  { id: 'volumeDown', label: 'Volume Down', group: 'Volume' },
  { id: 'mute', label: 'Mute', group: 'Volume' },
  { id: 'search', label: 'Search', group: 'Navigation', whileTyping: true },
  { id: 'back', label: 'Go Back', group: 'Navigation', whileTyping: true },
  { id: 'forward', label: 'Go Forward', group: 'Navigation', whileTyping: true },
  { id: 'settings', label: 'Settings', group: 'Navigation', whileTyping: true },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', group: 'Navigation' },
  { id: 'lyrics', label: 'Lyrics', group: 'View' },
  { id: 'nowPlaying', label: 'Now Playing', group: 'View' },
  { id: 'fullscreen', label: 'Full Screen', group: 'View', whileTyping: true },
  { id: 'miniPlayer', label: 'Mini Player', group: 'View' },
];

export const DEFAULT_BINDINGS: Record<ShortcutId, string[]> = {
  playPause: ['Space'],
  next: ['Ctrl+ArrowRight'],
  previous: ['Ctrl+ArrowLeft'],
  seekForward: ['Shift+ArrowRight'],
  seekBack: ['Shift+ArrowLeft'],
  shuffle: ['Ctrl+S'],
  repeat: ['Ctrl+R'],
  volumeUp: ['Ctrl+ArrowUp'],
  volumeDown: ['Ctrl+ArrowDown'],
  mute: ['M'],
  search: ['Ctrl+K', 'Ctrl+F', '/'],
  back: ['Alt+ArrowLeft'],
  forward: ['Alt+ArrowRight'],
  settings: ['Ctrl+,'],
  shortcuts: ['Shift+/'],
  lyrics: ['Ctrl+L'],
  nowPlaying: ['Ctrl+P'],
  fullscreen: ['F11'],
  miniPlayer: ['Ctrl+M'],
};

// ---- Keys ----

const MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS'];

/** Punctuation by its place on the keyboard, so Shift doesn't change the name. */
const PUNCTUATION: Record<string, string> = {
  Slash: '/',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
};

/** Keys that keep their usual job and can't be given to an action. */
const RESERVED = new Set(['Escape', 'Tab', 'Shift+Tab', 'Enter', 'Shift+Enter']);
export const isReserved = (combo: string) => RESERVED.has(combo);

/** The key pressed as a combo ("Ctrl+Shift+K"), or null for a modifier on its own. */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIERS.includes(e.key)) return null;
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^(Digit|Numpad)[0-9]$/.test(e.code)) key = e.code.slice(-1);
  else if (PUNCTUATION[e.code]) key = PUNCTUATION[e.code];
  else if (e.code === 'Space' || e.key === ' ') key = 'Space';
  else if (e.key.length === 1) key = e.key.toUpperCase();
  else key = e.key;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Win'].filter(Boolean);
  return [...mods, key].join('+');
}

const NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  MediaPlayPause: 'Play / Pause',
  MediaTrackNext: 'Next Track',
  MediaTrackPrevious: 'Previous Track',
};

/** A combo as keycaps to show: "Ctrl+ArrowRight" → ["Ctrl", "→"]. */
export function comboKeys(combo: string): string[] {
  // The last part is the key, and may itself be "+".
  const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+');
  return parts.filter(Boolean).map((p) => NAMES[p] ?? p);
}

// ---- The keys you set ----

const KEY = 'rakki.shortcuts';

function load(): Partial<Record<ShortcutId, string[]>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<ShortcutId, string[]>>;
  } catch {
    return {};
  }
}

function withDefaults(changed: Partial<Record<ShortcutId, string[]>>): Record<ShortcutId, string[]> {
  return { ...DEFAULT_BINDINGS, ...changed };
}

interface ShortcutsState {
  bindings: Record<ShortcutId, string[]>;
  /** A key field in Settings is listening: shortcuts don't run. */
  recording: boolean;
  setBinding(id: ShortcutId, combos: string[]): void;
  resetBinding(id: ShortcutId): void;
  resetAll(): void;
  setRecording(on: boolean): void;
}

let changed = load();

function save(next: Partial<Record<ShortcutId, string[]>>) {
  changed = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full: the change lasts until Rakki closes.
  }
  return withDefaults(next);
}

export const useShortcuts = create<ShortcutsState>((set) => ({
  bindings: withDefaults(changed),
  recording: false,
  setBinding(id, combos) {
    const unique = [...new Set(combos.filter((c) => c && !isReserved(c)))];
    const same = unique.length === DEFAULT_BINDINGS[id].length && unique.every((c, i) => c === DEFAULT_BINDINGS[id][i]);
    const next = { ...changed };
    if (same) delete next[id];
    else next[id] = unique;
    set({ bindings: save(next) });
  },
  resetBinding(id) {
    const next = { ...changed };
    delete next[id];
    set({ bindings: save(next) });
  },
  resetAll() {
    set({ bindings: save({}) });
  },
  setRecording(recording) {
    set({ recording });
  },
}));

/** The action already using this combo (other than `except`), or null. */
export function conflictOf(combo: string, except?: ShortcutId): ShortcutId | null {
  const b = useShortcuts.getState().bindings;
  return (Object.keys(b) as ShortcutId[]).find((id) => id !== except && b[id].includes(combo)) ?? null;
}

// ---- Running them ----

const handlers = new Map<ShortcutId, () => void>();

/** A part of the interface does an action itself (the title bar focuses its search box). */
export function onShortcut(id: ShortcutId, run: () => void): () => void {
  handlers.set(id, run);
  return () => {
    if (handlers.get(id) === run) handlers.delete(id);
  };
}

let unmuted = 50;
const REPEAT_NEXT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

const ACTIONS: Record<ShortcutId, () => void> = {
  playPause: () => usePlayer.getState().toggle(),
  next: () => usePlayer.getState().next(),
  previous: () => usePlayer.getState().previous(),
  seekForward: () => {
    const p = usePlayer.getState();
    p.seek(currentPosition(p) + 5);
  },
  seekBack: () => {
    const p = usePlayer.getState();
    p.seek(Math.max(0, currentPosition(p) - 5));
  },
  shuffle: () => usePlayer.getState().toggleShuffle(),
  repeat: () => {
    const p = usePlayer.getState();
    p.setRepeat(REPEAT_NEXT[p.repeat]);
  },
  volumeUp: () => {
    const p = usePlayer.getState();
    p.setVolume(p.volume + 5);
  },
  volumeDown: () => {
    const p = usePlayer.getState();
    p.setVolume(p.volume - 5);
  },
  mute: () => {
    const p = usePlayer.getState();
    if (p.volume > 0) {
      unmuted = p.volume;
      p.setVolume(0);
    } else p.setVolume(unmuted || 50);
  },
  search: () => go({ name: 'search' }),
  back: () => useNav.getState().back(),
  forward: () => useNav.getState().forward(),
  settings: () => go({ name: 'settings' }),
  shortcuts: () => go({ name: 'settings', section: 'shortcuts' }),
  lyrics: () => {
    const l = useLayout.getState();
    l.setLyricsView(!l.lyricsView);
  },
  nowPlaying: () => {
    const l = useLayout.getState();
    l.setNowPlaying(!l.nowPlaying);
  },
  fullscreen: () => {
    const l = useLayout.getState();
    l.setFullscreen(!l.fullscreen);
  },
  miniPlayer: () => void import('~/layout/MiniPlayer').then((m) => m.setMini(!useLayout.getState().mini)),
};

const HOLDABLE = new Set<ShortcutId>(['volumeUp', 'volumeDown', 'seekForward', 'seekBack']);

/** Runs the action for this key, if any (main.tsx's keydown). True when one ran. */
export function handleShortcut(e: KeyboardEvent): boolean {
  const id = idFor(e);
  if (!id || useShortcuts.getState().recording) return false;
  // Held down: only the volume and seeking keys repeat.
  if (e.repeat && !HOLDABLE.has(id)) return false;
  const el = e.target as HTMLElement | null;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? '') || !!el?.isContentEditable;
  const action = SHORTCUT_ACTIONS.find((a) => a.id === id);
  // A key with no Ctrl / Alt / Win in a field is typing ("/" types a slash there).
  const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !/^F\d+$/.test(e.key);
  if (typing && (!action?.whileTyping || plain)) return false;
  // Space on a focused button (or anything acting as one) presses it.
  if (e.code === 'Space' && el?.closest?.('button, [role="button"], [role="link"], [role="menuitem"], [role="slider"], [role="separator"], [role="row"], a')) return false;
  e.preventDefault();
  (handlers.get(id) ?? ACTIONS[id])();
  return true;
}

function idFor(e: KeyboardEvent): ShortcutId | null {
  const combo = comboFromEvent(e);
  if (!combo) return null;
  const b = useShortcuts.getState().bindings;
  return (Object.keys(b) as ShortcutId[]).find((id) => b[id].includes(combo)) ?? null;
}
