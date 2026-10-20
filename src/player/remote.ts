// The phone taking commands from your other Rakki apps (phase 2 of docs/REMOTE_PLAYBACK.md):
// play these songs, pause, resume, skip, seek, repeat and shuffle, through remote/socket.ts.
// iOS keeps Rakki running while it plays, so a playing phone can always be controlled; an idle,
// suspended one hears nothing until it's opened. "Stop" pauses, so the queue is still here.
// (Volume isn't offered: an app can't set the phone's volume.)
import { AppState } from 'react-native';

import { useAuth } from '@/auth/store';
import { listenForCommands, type RemotePlayer } from '@/remote/socket';
import { usePlayer } from '@/player/store';

const player: RemotePlayer = {
  async playItems(ids, startIndex, startSec) {
    const client = useAuth.getState().client;
    if (!client) return;
    const found = await client.getItemsByIds(ids);
    const byId = new Map(found.map((it) => [it.Id, it]));
    const items = ids.map((id) => byId.get(id)).filter((x) => x !== undefined);
    if (!items.length) return;
    const wanted = ids[startIndex];
    const index = Math.max(0, items.findIndex((x) => x.Id === wanted));
    usePlayer.getState().playQueue(items, { startIndex: index, shuffle: false });
    // Once it's loaded, to where the other device was.
    if (startSec > 1) setTimeout(() => usePlayer.getState().seek(startSec), 700);
  },
  async queueItems(ids, where) {
    const c = useAuth.getState().client;
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
  setRepeat(mode) {
    // The player cycles off → all → one; step until it's there.
    for (let i = 0; i < 3 && usePlayer.getState().repeat !== mode; i++) usePlayer.getState().cycleRepeat();
  },
  setShuffle(on) {
    if (usePlayer.getState().shuffle !== on) usePlayer.getState().toggleShuffle();
  },
};

let stop: (() => void) | null = null;
let watching = false;

/** At sign-in (the root layout, whenever the account changes); stops the previous one. */
export function startRemoteCommands() {
  stop?.();
  stop = null;
  const client = useAuth.getState().client;
  if (client) stop = listenForCommands(client, player);
  // iOS drops the connection while Rakki sleeps; coming back to the front reconnects at once
  // instead of waiting out the retry pause.
  if (!watching) {
    watching = true;
    AppState.addEventListener('change', (state) => state === 'active' && useAuth.getState().client && startRemoteCommands());
  }
}

