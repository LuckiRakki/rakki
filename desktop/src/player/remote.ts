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
import { usePlayer } from '~/player/store';
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

async function refresh() {
  const c = client();
  const t = useRemote.getState().target;
  if (!c || !t) return;
  const fresh = await deviceNow(c, t.sessionId).catch(() => undefined);
  if (useRemote.getState().target?.sessionId !== t.sessionId) return;
  if (fresh === null) {
    toast(`${t.name} went away`);
    useRemote.getState().setTarget(null);
  } else if (fresh) useRemote.setState({ target: fresh });
}

export const useRemote = create<RemoteState>((set, get) => ({
  target: null,
  busy: null,
  setTarget(d) {
    if (poll) clearInterval(poll);
    poll = null;
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
    if (c && t) void setDeviceVolume(c, t, percent).catch(() => {});
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
      const at = p.playing ? p.position + (performance.now() - p.positionAt) / 1000 : p.position;
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
