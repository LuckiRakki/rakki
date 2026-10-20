// Controlling another Rakki from this phone, like Spotify Connect (docs/REMOTE_PLAYBACK.md).
// Once the music moves to another device (or you pick one that's playing in Connect), the mini
// player and the player screen show that device's song ("Listening on Rakki Desktop") and their
// buttons command it: play/pause, skip, seek. It's asked how it's doing every two seconds while
// picked. Picking This Phone (or the device going away) brings the player back to this phone.
import { useEffect, useReducer } from 'react';
import { create } from 'zustand';

import { useAuth } from '@/auth/store';
import { usePlayer } from '@/player/store';
import { control, deviceNow, positionNow, setDeviceVolume, type RakkiDevice } from '@/remote/devices';
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

async function refresh() {
  const c = useAuth.getState().client;
  const t = useRemoteTarget.getState().target;
  if (!c || !t) return;
  const fresh = await deviceNow(c, t.sessionId).catch(() => undefined);
  if (useRemoteTarget.getState().target?.sessionId !== t.sessionId) return;
  if (fresh === null) {
    showToast(`${t.name} went away. Back on This Phone.`);
    useRemoteTarget.getState().setTarget(null);
  } else if (fresh) useRemoteTarget.setState({ target: fresh });
}

export const useRemoteTarget = create<RemoteTargetState>((set, get) => ({
  target: null,
  setTarget(d) {
    if (poll) clearInterval(poll);
    poll = null;
    set({ target: d });
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
    if (c && t) void setDeviceVolume(c, t, percent).catch(() => {});
  },
}));

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
  return { position: positionNow(t), duration: t.item.RunTimeTicks ? t.item.RunTimeTicks / 10_000_000 : 0 };
}
