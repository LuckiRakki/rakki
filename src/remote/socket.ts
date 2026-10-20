// Playing across devices, phase 2 (docs/REMOTE_PLAYBACK.md): this app listens on the server's
// live connection (/socket) for commands another Rakki sends it (play these songs, pause, next,
// seek, volume...) and hands them to its player. Shared by the phone and the desktop; each app
// gives it a RemotePlayer for its own player. Reconnects on its own, with growing pauses, and
// tells the server again what it can do after every reconnect.
import type { JellyfinClient } from '@/api/jellyfin';
import { announceCapabilities } from '@/remote/devices';

const TICKS_PER_SECOND = 10_000_000;

/** What this app's player does for remote commands (only what it supports). */
export interface RemotePlayer {
  /** Play these songs (ids, in order) from `startIndex`, `startSec` into it. */
  playItems(ids: string[], startIndex: number, startSec: number): void | Promise<void>;
  /** Play these after the current song (next) or at the end of the queue (last). */
  queueItems?(ids: string[], where: 'next' | 'last'): void | Promise<void>;
  playPause(): void;
  pause(): void;
  unpause(): void;
  stop(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  setVolume?(percent: number): void;
  setRepeat?(mode: 'off' | 'all' | 'one'): void;
  setShuffle?(on: boolean): void;
}

/** The general commands a player supports, for the server (and the controlling app's buttons). */
export function supportedCommands(p: RemotePlayer): string[] {
  return [
    ...(p.setVolume ? ['SetVolume', 'VolumeUp', 'VolumeDown', 'Mute', 'Unmute', 'ToggleMute'] : []),
    ...(p.setRepeat ? ['SetRepeatMode'] : []),
    ...(p.setShuffle ? ['SetShuffleQueue'] : []),
  ];
}

interface Message {
  MessageType: string;
  Data?: unknown;
}

let lastVolume = 80;

function obey(msg: Message, p: RemotePlayer) {
  const data = (msg.Data ?? {}) as Record<string, unknown>;
  switch (msg.MessageType) {
    case 'Play': {
      const ids = (data.ItemIds as string[] | undefined) ?? [];
      if (!ids.length) return;
      if (data.PlayCommand === 'PlayNext' || data.PlayCommand === 'PlayLast') {
        void p.queueItems?.(ids, data.PlayCommand === 'PlayNext' ? 'next' : 'last');
        return;
      }
      if (data.PlayCommand && data.PlayCommand !== 'PlayNow') return;
      void p.playItems(ids, Number(data.StartIndex ?? 0), Number(data.StartPositionTicks ?? 0) / TICKS_PER_SECOND);
      return;
    }
    case 'Playstate': {
      const cmd = data.Command as string;
      if (cmd === 'PlayPause') p.playPause();
      else if (cmd === 'Pause') p.pause();
      else if (cmd === 'Unpause') p.unpause();
      else if (cmd === 'Stop') p.stop();
      else if (cmd === 'NextTrack') p.next();
      else if (cmd === 'PreviousTrack') p.previous();
      else if (cmd === 'Seek') p.seek(Number(data.SeekPositionTicks ?? 0) / TICKS_PER_SECOND);
      return;
    }
    case 'GeneralCommand': {
      const name = data.Name as string;
      const args = (data.Arguments ?? {}) as Record<string, string>;
      if (name === 'SetVolume' && p.setVolume) {
        lastVolume = Math.max(0, Math.min(100, Number(args.Volume)));
        p.setVolume(lastVolume);
      } else if (name === 'VolumeUp' && p.setVolume) p.setVolume((lastVolume = Math.min(100, lastVolume + 5)));
      else if (name === 'VolumeDown' && p.setVolume) p.setVolume((lastVolume = Math.max(0, lastVolume - 5)));
      else if ((name === 'Mute' || name === 'ToggleMute') && p.setVolume) p.setVolume(0);
      else if (name === 'Unmute' && p.setVolume) p.setVolume(lastVolume || 80);
      else if (name === 'SetRepeatMode' && p.setRepeat) {
        const m = args.RepeatMode;
        p.setRepeat(m === 'RepeatOne' ? 'one' : m === 'RepeatAll' ? 'all' : 'off');
      } else if (name === 'SetShuffleQueue' && p.setShuffle) p.setShuffle(args.ShuffleMode === 'Shuffle');
      return;
    }
  }
}

/**
 * Listen for commands until the returned function is called (sign-out, another account).
 * `volume()` tells it the player's volume so Volume up/down start from the right place.
 */
export function listenForCommands(client: JellyfinClient, player: RemotePlayer, volume?: () => number): () => void {
  let ws: WebSocket | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let wait = 1000;
  let closed = false;

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(client.socketUrl());
    } catch {
      return schedule();
    }
    ws.onopen = () => {
      wait = 1000;
      void announceCapabilities(client, supportedCommands(player));
    };
    ws.onmessage = (e) => {
      let msg: Message;
      try {
        msg = JSON.parse(String(e.data)) as Message;
      } catch {
        return;
      }
      if (msg.MessageType === 'ForceKeepAlive') {
        // The server drops connections that go quiet; it says how often to check in.
        const every = Math.max(10, Number(msg.Data ?? 60)) * 500;
        if (keepAlive) clearInterval(keepAlive);
        keepAlive = setInterval(() => ws?.readyState === 1 && ws.send(JSON.stringify({ MessageType: 'KeepAlive' })), every);
        return;
      }
      if (volume) lastVolume = volume();
      try {
        obey(msg, player);
      } catch {
        // A command the player couldn't carry out: ignore it, keep listening.
      }
    };
    ws.onclose = () => {
      if (keepAlive) clearInterval(keepAlive);
      keepAlive = null;
      schedule();
    };
    ws.onerror = () => ws?.close();
  };

  const schedule = () => {
    if (closed || retry) return;
    retry = setTimeout(() => {
      retry = null;
      connect();
    }, wait);
    wait = Math.min(30_000, wait * 2);
  };

  connect();
  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    if (keepAlive) clearInterval(keepAlive);
    ws?.close();
  };
}
