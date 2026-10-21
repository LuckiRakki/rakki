// Controlling another Rakki from this phone, like Spotify Connect (docs/REMOTE_PLAYBACK.md).
// Once the music moves to another device (or you pick one that's playing in Connect), the mini
// player and the player screen show that device's song ("Listening on Rakki Desktop") and their
// buttons command it: play/pause, skip, seek, volume. Songs picked anywhere in the app play there too,
// and Play Next / Add to Queue add to its queue (player/store.ts routeToRemote). It's asked how it's doing every two seconds while
// picked. Picking This Phone (or the device going away) brings the player back to this phone.
import { useEffect, useReducer } from 'react';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { routeToRemote, usePlayer } from '@/player/store';
import { control, deviceNow, positionNow, pushTo, queueOn, setDeviceVolume, type RakkiDevice } from '@/remote/devices';
import { showToast } from '@/ui/overlays';

const POLL_MS = 2000;

interface RemoteTargetState {
  /** The device the player controls (null: this phone). */
  target: RakkiDevice | null;
  setTarget(d: RakkiDevice | null): void;
  /** Send a command and show its effect at once (the next check corrects it). */
  command(cmd: 'PlayPause' | 'NextTrack' | 'PreviousTrack'): void;
  seek(seconds: number): void;
  volume(percent: number): void;
}

let poll: ReturnType<typeof setInterval> | null = null;

/**
 * When the device last reported its place, by this phone's clock. The server stamps reports with
 * its own clock, which can be seconds off from the phone's (the place ran 6-7 s ahead), so a
 * report counts as new when its place, song or pause changes between two checks, and it was
 * made about halfway between them (checks are 2 s apart, apps report every 10 s or on a change).
 */
let lastReport = '';
/** A volume just set here shows until the device has had time to report it (ms since 1970). */
let volumeHeldUntil = 0;
const VOLUME_HOLD_MS = 4000;

function timed(fresh: RakkiDevice, prev: RakkiDevice): RakkiDevice {
  const key = `${fresh.item?.Id}|${fresh.paused}|${fresh.reportedSec}`;
  const first = !lastReport;
  if (key === lastReport) {
    // The same report: keep the place as already worked out (or as just commanded).
    return prev.paused === fresh.paused && prev.item?.Id === fresh.item?.Id ? { ...fresh, reportedSec: prev.reportedSec, reportedAt: prev.reportedAt } : fresh;
  }
  lastReport = key;
  return first ? fresh : { ...fresh, reportedAt: Date.now() - POLL_MS / 2 };
}

async function refresh() {
  const c = useAuth.getState().client;
  const t = useRemoteTarget.getState().target;
  if (!c || !t) return;
  const fresh = await deviceNow(c, t.sessionId).catch(() => undefined);
  if (useRemoteTarget.getState().target?.sessionId !== t.sessionId) return;
  if (fresh === null) {
    showToast(`${t.name} went away. Back on This Phone.`);
    useRemoteTarget.getState().setTarget(null);
  } else if (fresh) {
    const prev = useRemoteTarget.getState().target ?? t;
    const next = timed(fresh, prev);
    useRemoteTarget.setState({ target: Date.now() < volumeHeldUntil ? { ...next, volume: prev.volume } : next });
  }
}

export const useRemoteTarget = create<RemoteTargetState>((set, get) => ({
  target: null,
  setTarget(d) {
    if (poll) clearInterval(poll);
    poll = null;
    lastReport = '';
    volumeHeldUntil = 0;
    set({ target: d });
    routeToRemote(d ? route : null);
    if (d) poll = setInterval(() => void refresh(), POLL_MS);
  },
  command(cmd) {
    const c = useAuth.getState().client;
    const t = get().target;
    if (!c || !t) return;
    if (cmd === 'PlayPause') set({ target: { ...t, paused: !t.paused, reportedSec: positionNow(t), reportedAt: Date.now() } });
    void control(c, t, cmd)
      .then(() => setTimeout(() => void refresh(), 600))
      .catch(() => showToast(`Couldn’t reach ${t.name}`));
  },
  seek(seconds) {
    const c = useAuth.getState().client;
    const t = get().target;
    if (!c || !t) return;
    set({ target: { ...t, reportedSec: seconds, reportedAt: Date.now() } });
    void control(c, t, 'Seek', seconds).catch(() => showToast(`Couldn’t reach ${t.name}`));
  },
  volume(percent) {
    const c = useAuth.getState().client;
    const t = get().target;
    if (!c || !t) return;
    const v = Math.max(0, Math.min(100, Math.round(percent)));
    volumeHeldUntil = Date.now() + VOLUME_HOLD_MS;
    set({ target: { ...t, volume: v } });
    void setDeviceVolume(c, t, v).catch(() => showToast(`Couldn’t reach ${t.name}`));
  },
}));

/** Songs picked on this phone, sent to the device it controls. */
const route = {
  play(items: BaseItem[], index: number) {
    const c = useAuth.getState().client;
    const t = useRemoteTarget.getState().target;
    if (!c || !t) return;
    // Shown at once; the device catches up a moment later.
    useRemoteTarget.setState({ target: { ...t, item: items[index] ?? t.item, paused: false, reportedSec: 0, reportedAt: Date.now() } });
    void pushTo(c, t, items, index, 0)
      .then((ok) => {
        if (!ok) showToast(`${t.name} didn’t start that song. Try again.`);
        void refresh();
      })
      .catch(() => showToast(`Couldn’t reach ${t.name}`));
  },
  queue(items: BaseItem[], where: 'next' | 'last') {
    const c = useAuth.getState().client;
    const t = useRemoteTarget.getState().target;
    if (c && t) void queueOn(c, t, items, where).catch(() => showToast(`Couldn’t reach ${t.name}`));
  },
};

// Playing something on this phone makes it the player again.
usePlayer.subscribe((s, prev) => {
  if (s.playing && !prev.playing && useRemoteTarget.getState().target) useRemoteTarget.getState().setTarget(null);
});

/** The target's place in its song, ticking along between checks. */
export function useRemoteProgress(intervalMs = 500): { position: number; duration: number } {
  const t = useRemoteTarget((s) => s.target);
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!t || t.paused) return;
    const id = setInterval(force, intervalMs);
    return () => clearInterval(id);
  }, [t, intervalMs]);
  if (!t?.item) return { position: 0, duration: 0 };
  const duration = t.item.RunTimeTicks ? t.item.RunTimeTicks / 10_000_000 : 0;
  // Between checks it's a guess, so it stops at the end of the song.
  return { position: duration > 0 ? Math.min(positionNow(t), duration) : positionNow(t), duration };
}
