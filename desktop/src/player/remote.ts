// Playing across devices on the desktop (docs/REMOTE_PLAYBACK.md, phases 2 and 3).
// - This computer takes commands from your other Rakki apps (remote/socket.ts): play these
//   songs, pause, skip, seek, volume, repeat, shuffle. "Stop" pauses, so the queue stays.
// - It controls another one: pick it in Devices and the player bar becomes that device's
//   ("Playing on Ana's iPhone"), its buttons sending commands; it's asked how it's doing
//   every two seconds while picked.
// - It moves playback: Play here (take the other device's queue and place, and stop it) and
//   Play on {device} (send it this queue and place, and pause here once it plays).
import { create } from 'zustand';

import { control, deviceNow, positionNow, pullFrom, pushTo, setDeviceVolume, type RakkiDevice } from '@/remote/devices';
import { listenForCommands, type RemotePlayer } from '@/remote/socket';
import { client } from '~/auth/session';
import { invoke } from '@tauri-apps/api/core';

import { inTauri } from '~/lib/tauri';
import { engine } from '~/player/engine';
import { currentPosition, handOverMedia, usePlayer } from '~/player/store';
import { useVideo } from '~/player/video';
import { toast } from '~/ui/overlays';

const POLL_MS = 2000;

// ---- Taking commands ----

const here: RemotePlayer = {
  async playItems(ids, startIndex, startSec) {
    const c = client();
    if (!c) return;
    const found = await c.getItemsByIds(ids);
    const byId = new Map(found.map((it) => [it.Id, it]));
    const items = ids.map((id) => byId.get(id)).filter((x) => x !== undefined);
    if (!items.length) return;
    const index = Math.max(0, items.findIndex((x) => x.Id === ids[startIndex]));
    useVideo.getState().close();
    usePlayer.getState().playQueue(items, index, { shuffle: false, at: startSec });
  },
  async queueItems(ids, where) {
    const c = client();
    if (!c) return;
    const found = await c.getItemsByIds(ids);
    const byId = new Map(found.map((it) => [it.Id, it]));
    const items = ids.map((id) => byId.get(id)).filter((x) => x !== undefined);
    if (where === 'next') usePlayer.getState().playNext(items);
    else usePlayer.getState().addToQueue(items);
  },
  playPause: () => usePlayer.getState().toggle(),
  pause: () => usePlayer.getState().playing && usePlayer.getState().toggle(),
  unpause: () => !usePlayer.getState().playing && usePlayer.getState().toggle(),
  stop: () => usePlayer.getState().playing && usePlayer.getState().toggle(),
  next: () => usePlayer.getState().next(),
  previous: () => usePlayer.getState().previous(),
  seek: (seconds) => usePlayer.getState().seek(seconds),
  setVolume: (percent) => usePlayer.getState().setVolume(percent),
  setRepeat: (mode) => usePlayer.getState().setRepeat(mode),
  setShuffle: (on) => usePlayer.getState().shuffle !== on && usePlayer.getState().toggleShuffle(),
};

let stopListening: (() => void) | null = null;

/** At sign-in (and when the account changes). */
export function startRemoteCommands() {
  stopListening?.();
  stopListening = null;
  const c = client();
  if (c) stopListening = listenForCommands(c, here, () => usePlayer.getState().volume);
}

// ---- Controlling another device ----

interface RemoteState {
  /** The device the player bar controls (null: this computer). */
  target: RakkiDevice | null;
  /** A move in progress ("Moving to iPhone…"). */
  busy: string | null;
  setTarget(d: RakkiDevice | null): void;
  /** Send a command to the target and show its effect at once. */
  command(cmd: 'PlayPause' | 'NextTrack' | 'PreviousTrack'): void;
  seek(seconds: number): void;
  volume(percent: number): void;
  playHere(d: RakkiDevice): Promise<void>;
  playOn(d: RakkiDevice): Promise<void>;
}

let poll: ReturnType<typeof setInterval> | null = null;
/** A volume just set here shows until the device has had time to report it (ms since 1970). */
let volumeHeldUntil = 0;
const VOLUME_HOLD_MS = 4000;

async function refresh() {
  const c = client();
  const t = useRemote.getState().target;
  if (!c || !t) return;
  const fresh = await deviceNow(c, t.sessionId).catch(() => undefined);
  if (useRemote.getState().target?.sessionId !== t.sessionId) return;
  if (fresh === null) {
    toast(`${t.name} went away`);
    useRemote.getState().setTarget(null);
  } else if (fresh) {
    const prev = useRemote.getState().target;
    useRemote.setState({ target: Date.now() < volumeHeldUntil && prev ? { ...fresh, volume: prev.volume } : fresh });
  }
}

export const useRemote = create<RemoteState>((set, get) => ({
  target: null,
  busy: null,
  setTarget(d) {
    if (poll) clearInterval(poll);
    poll = null;
    volumeHeldUntil = 0;
    set({ target: d });
    if (d) poll = setInterval(() => void refresh(), POLL_MS);
  },
  command(cmd) {
    const c = client();
    const t = get().target;
    if (!c || !t) return;
    // Shown at once; the next check corrects it if the device saw it differently.
    if (cmd === 'PlayPause') set({ target: { ...t, paused: !t.paused, reportedSec: positionNow(t), reportedAt: Date.now() } });
    void control(c, t, cmd)
      .then(() => setTimeout(() => void refresh(), 600))
      .catch(() => toast(`Couldn’t reach ${t.name}`));
  },
  seek(seconds) {
    const c = client();
    const t = get().target;
    if (!c || !t) return;
    set({ target: { ...t, reportedSec: seconds, reportedAt: Date.now() } });
    void control(c, t, 'Seek', seconds).catch(() => toast(`Couldn’t reach ${t.name}`));
  },
  volume(percent) {
    const c = client();
    const t = get().target;
    if (!c || !t) return;
    const v = Math.max(0, Math.min(100, Math.round(percent)));
    volumeHeldUntil = Date.now() + VOLUME_HOLD_MS;
    set({ target: { ...t, volume: v } });
    void setDeviceVolume(c, t, v).catch(() => toast(`Couldn’t reach ${t.name}`));
  },
  async playHere(d) {
    const c = client();
    if (!c || get().busy) return;
    set({ busy: `Taking over from ${d.name}…` });
    try {
      const h = await pullFrom(c, d);
      if (!h.items.length) return void toast(`Nothing to take over from ${d.name}`);
      useVideo.getState().close();
      const p = usePlayer.getState();
      p.playQueue(h.items, h.index, { shuffle: false, at: h.positionSec });
      if (p.repeat !== h.repeat) usePlayer.getState().setRepeat(h.repeat);
      await h.release();
      get().setTarget(null);
      toast(`Playing here (from ${d.name})`);
    } catch {
      toast(`Couldn’t take over from ${d.name}`);
    } finally {
      set({ busy: null });
    }
  },
  async playOn(d) {
    const c = client();
    const p = usePlayer.getState();
    if (!c || get().busy || !p.queue.length) return;
    set({ busy: `Moving to ${d.name}…` });
    try {
      const at = currentPosition(p);
      const ok = await pushTo(c, d, p.queue, p.index, at);
      if (!ok) return void toast(`${d.name} didn’t start (open Rakki on it and try again)`);
      if (usePlayer.getState().playing) usePlayer.getState().toggle();
      const fresh = await deviceNow(c, d.sessionId).catch(() => null);
      get().setTarget(fresh ?? d);
      toast(`Playing on ${d.name}`);
    } catch {
      toast(`Couldn’t reach ${d.name}`);
    } finally {
      set({ busy: null });
    }
  },
}));

// ---- Phase 4: the media controls and the tray follow the controlled device ----

const TICKS = 10_000_000;

/** Media keys, the media overlay and the tray menu, for the controlled device. */
function remoteKeys(command: string): boolean {
  const r = useRemote.getState();
  const t = r.target;
  if (!t) return false;
  if (command === 'toggle') r.command('PlayPause');
  else if (command === 'play') t.paused && r.command('PlayPause');
  else if (command === 'pause' || command === 'stop') !t.paused && r.command('PlayPause');
  else if (command === 'next') r.command('NextTrack');
  else if (command === 'previous') r.command('PreviousTrack');
  else if (command === 'forward') r.seek(positionNow(t) + 10);
  else if (command === 'backward') r.seek(Math.max(0, positionNow(t) - 10));
  else if (command.startsWith('position:')) r.seek(Number(command.slice(9)));
  return true;
}

let shown = '';

function showRemoteMedia(t: RakkiDevice) {
  const c = client();
  const item = t.item;
  const key = `${t.sessionId}|${item?.Id}|${t.paused}|${Math.round(t.reportedSec)}`;
  if (key === shown) return;
  const songChanged = shown.split('|')[1] !== item?.Id || shown.split('|')[0] !== t.sessionId;
  shown = key;
  if (songChanged) {
    void engine.nowPlaying(
      item
        ? {
            title: item.Name,
            artist: `${item.Artists?.join(', ') || item.AlbumArtist || ''} · on ${t.name}`,
            album: item.Album ?? '',
            artwork: c?.imageUrl(item, 600),
            duration: item.RunTimeTicks ? item.RunTimeTicks / TICKS : undefined,
          }
        : null,
    );
  }
  if (item) void engine.playback(!t.paused, positionNow(t));
}

/** The tray icon's tooltip: what's playing, and where. */
function trayText(): string {
  const t = useRemote.getState().target;
  if (t) return t.item ? `Rakki: playing on ${t.name}\n${t.item.Name} · ${t.item.Artists?.join(', ') ?? ''}` : `Rakki: controlling ${t.name}`;
  const p = usePlayer.getState();
  const item = p.queue[p.index];
  if (!item) return 'Rakki';
  return `Rakki${p.playing ? '' : ' (paused)'}\n${item.Name} · ${item.Artists?.join(', ') || item.AlbumArtist || ''}`;
}

let trayShown = '';
function updateTray() {
  const text = trayText().slice(0, 127);
  if (text === trayShown || !inTauri) return;
  trayShown = text;
  void invoke('tray_tooltip', { text }).catch(() => {});
}

let wired = false;

/** main.tsx, once. */
export function startRemoteMedia() {
  if (wired) return;
  wired = true;
  useRemote.subscribe((s, prev) => {
    if (s.target && !prev.target) handOverMedia(remoteKeys);
    if (!s.target && prev.target) {
      shown = '';
      handOverMedia(null);
    }
    if (s.target) showRemoteMedia(s.target);
    updateTray();
  });
  usePlayer.subscribe((s, prev) => {
    if (s.playing !== prev.playing || s.queue[s.index]?.Id !== prev.queue[prev.index]?.Id) updateTray();
  });
  updateTray();
}
