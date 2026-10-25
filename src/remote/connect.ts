// What the phone's Connect screen (app/devices.tsx) does with a device. A tap does the likely
// thing (move this phone's music there, or control what plays there when nothing plays here);
// holding a device offers each choice (deviceChoices): play this phone's song there, just
// remote control it, or bring its music here. Each closes the screen at once; a toast says
// when it's playing (or why not).
import { router } from 'expo-router';

import type { JellyfinClient } from '@/api/jellyfin';
import { tick } from '@/lib/haptics';
import { engine } from '@/player/engine';
import { useRemoteTarget } from '@/player/remoteTarget';
import { usePlayer } from '@/player/store';
import { deviceNow, pullFrom, pushTo, type RakkiDevice } from '@/remote/devices';
import { showToast } from '@/ui/overlays';

/** Music being moved: one at a time. */
let moving = false;

/** Bring the music here from the device that's playing it. */
export async function moveHere(client: JellyfinClient, d: RakkiDevice) {
  if (moving) return;
  tick();
  moving = true;
  router.back();
  try {
    const h = await pullFrom(client, d);
    useRemoteTarget.getState().setTarget(null);
    if (!h.items.length) return showToast(`Nothing to take over from ${d.name}`);
    usePlayer.getState().playQueue(h.items, { startIndex: h.index, shuffle: false });
    if (h.positionSec > 1) setTimeout(() => usePlayer.getState().seek(h.positionSec), 700);
    await h.release();
    showToast(`Playing on This Phone (from ${d.name})`);
  } catch {
    showToast(`Couldn’t take over from ${d.name}`);
  } finally {
    moving = false;
  }
}

/** Move this phone's music to another device (this phone becomes its remote). */
export async function moveTo(client: JellyfinClient, d: RakkiDevice) {
  const p = usePlayer.getState();
  if (moving) return;
  if (!p.queue.length) return showToast('Play something here first, then move it');
  tick();
  moving = true;
  router.back();
  try {
    const ok = await pushTo(client, d, p.queue.map((e) => e.item), p.index, engine.getProgress().position);
    if (!ok) return showToast(`${d.name} didn’t start. Open Rakki there and try again.`);
    if (usePlayer.getState().playing) usePlayer.getState().toggle();
    // This phone becomes its remote: the player shows that device's song and controls it.
    const fresh = await deviceNow(client, d.sessionId).catch(() => null);
    useRemoteTarget.getState().setTarget(fresh ?? d);
    showToast(`Playing on ${d.name}`);
  } catch {
    showToast(`Couldn’t reach ${d.name}`);
  } finally {
    moving = false;
  }
}

/** Control the device from this phone, leaving the music where it is (on both). */
export function remoteControl(d: RakkiDevice) {
  tick();
  useRemoteTarget.getState().setTarget(d);
  router.back();
}

/** A tap: control what plays there when nothing plays here, else move the music there. */
export function tapDevice(client: JellyfinClient, d: RakkiDevice) {
  if (useRemoteTarget.getState().target?.sessionId === d.sessionId) return;
  const p = usePlayer.getState();
  if (!p.queue.length || (!p.playing && d.item)) return remoteControl(d);
  void moveTo(client, d);
}

export type DeviceChoiceKey = 'playThere' | 'control' | 'takeOver';

export interface DeviceChoice {
  key: DeviceChoiceKey;
  label: string;
  enabled: boolean;
  /** Why it can't be picked now (a caption under it). */
  why?: string;
}

/** What holding a device offers, in order. */
export function deviceChoices(d: RakkiDevice): DeviceChoice[] {
  const p = usePlayer.getState();
  const here = p.queue[p.index]?.item;
  const controlling = useRemoteTarget.getState().target?.sessionId === d.sessionId;
  const off = !d.controllable ? 'Update Rakki there to connect to it' : undefined;
  return [
    {
      key: 'playThere',
      label: 'Play This Phone’s Song There',
      enabled: !off && !!here,
      why: off ?? (here ? undefined : 'Nothing is playing on this phone'),
    },
    {
      key: 'control',
      label: 'Remote Control It',
      enabled: !off && !controlling,
      why: off ?? (controlling ? 'This phone controls it already' : undefined),
    },
    {
      key: 'takeOver',
      label: 'Play Its Song Here',
      enabled: !!d.item,
      why: d.item ? undefined : 'Nothing is playing there',
    },
  ];
}

/** Do what was picked from the held device's choices. */
export function runChoice(client: JellyfinClient, d: RakkiDevice, key: DeviceChoiceKey) {
  if (key === 'playThere') void moveTo(client, d);
  else if (key === 'control') remoteControl(d);
  else void moveHere(client, d);
}
