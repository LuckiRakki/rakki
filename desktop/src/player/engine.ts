// The bridge to the native side (src-tauri): mpv playback and the system's media controls.
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface NowPlaying {
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  duration?: number;
}

export const engine = {
  load: (current: string, next: string | null, start: number, play: boolean) =>
    invoke<void>('player_load', { current, next, start, play }),
  setNext: (next: string | null) => invoke<void>('player_set_next', { next }),
  set: (name: string, value: unknown) => invoke<void>('player_set', { name, value }),
  seek: (seconds: number) => invoke<void>('player_seek', { seconds }),
  stop: () => invoke<void>('player_stop'),
  nowPlaying: (now: NowPlaying | null) => invoke<void>('media_now_playing', { now }).catch(() => {}),
  playback: (playing: boolean, position: number) => invoke<void>('media_playback', { playing, position }).catch(() => {}),
};

export interface EngineEvents {
  /** One of mpv's properties changed (pause, time-pos, duration, idle-active, paused-for-cache, volume). */
  onProp(name: string, value: unknown): void;
  /** mpv moved on to the next song on its own. */
  onAdvanced(): void;
  /** A song stopped: "eof" (finished), "error", "stop" (replaced)... */
  onEnd(reason: string, error: unknown): void;
  /** A media key, Windows' media overlay, Linux's MPRIS or the tray menu. */
  onControl(command: string): void;
  /** The window was hidden to the tray (true) or shown again (false). */
  onHidden(hidden: boolean): void;
}

export async function listenEngine(h: EngineEvents): Promise<UnlistenFn> {
  const subs = await Promise.all([
    listen<{ name: string; value: unknown }>('player://prop', (e) => h.onProp(e.payload.name, e.payload.value)),
    listen('player://advanced', () => h.onAdvanced()),
    listen<{ reason: string; error: unknown }>('player://end', (e) => h.onEnd(e.payload.reason, e.payload.error)),
    listen<string>('media://control', (e) => h.onControl(e.payload)),
    listen('window://hidden', () => h.onHidden(true)),
    listen('window://shown', () => h.onHidden(false)),
  ]);
  return () => subs.forEach((u) => u());
}
