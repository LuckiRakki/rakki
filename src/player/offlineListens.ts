// Listens while offline. Jellyfin can't hear about them as they happen, so songs that count as
// played are kept (per account) and sent once the server is back: each one counts as a play
// on the date it happened, so play counts and "Recently played" catch up. (Last.fm scrobbling
// through the server plugin only sees live playback, so it doesn't get these.)
import { JellyfinError } from '@/api/jellyfin';
import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { useNetwork } from '@/lib/network';
import { isOffline, useServerReachable } from '@/lib/online';
import { readPref, writePref } from '@/lib/prefs';
import { useSettings } from '@/settings/store';

interface Listen {
  itemId: string;
  /** When the song finished (ISO). */
  at: string;
}

const MAX_KEPT = 5000;
const key = (userId: string) => `rakki.offlineListens.${userId}`;

function load(userId: string): Listen[] {
  try {
    const list = JSON.parse(readPref(key(userId)) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(userId: string, list: Listen[]) {
  writePref(key(userId), JSON.stringify(list.slice(-MAX_KEPT)));
}

/**
 * Jellyfin's own rule for "played": 90% of the song (or the whole of it). Songs without a known
 * length count after 30 seconds.
 */
export function countsAsPlayed(positionSec: number, durationSec: number): boolean {
  return durationSec > 0 ? positionSec >= durationSec * 0.9 : positionSec >= 30;
}

/** Keep a listen the server couldn't be told about. */
export function keepListen(itemId: string, at = new Date()) {
  const userId = useAuth.getState().session?.userId;
  if (!userId) return;
  save(userId, [...load(userId), { itemId, at: at.toISOString() }]);
}

let sending = false;

/** Send the kept listens, oldest first; stops at the first connection problem. */
export async function sendKeptListens() {
  const { client, session } = useAuth.getState();
  if (sending || !client || !session || isOffline()) return;
  const userId = session.userId;
  if (!load(userId).length) return;
  sending = true;
  let sent = 0;
  try {
    while (!isOffline() && useAuth.getState().session?.userId === userId) {
      const next = load(userId)[0];
      if (!next) break;
      try {
        await client.markPlayed(next.itemId, new Date(next.at));
        sent++;
      } catch (e) {
        // A song that's gone from the server (or a listen it won't take) is dropped; anything
        // else (offline, timeout, signed out) waits for the next try.
        const status = e instanceof JellyfinError ? e.status : undefined;
        if (status !== 400 && status !== 404) break;
      }
      // Listens are only added at the end, so the one just handled is still the first.
      save(userId, load(userId).slice(1));
    }
  } finally {
    sending = false;
  }
  if (sent) void queryClient.invalidateQueries({ queryKey: ['recentlyPlayed'] });
}

// Back online (connection, server, or Offline mode switched off): send what was kept.
const retry = () => {
  if (!isOffline()) void sendKeptListens();
};
useServerReachable.subscribe((s, prev) => s.reachable !== prev.reachable && retry());
useNetwork.subscribe((s, prev) => s.connected !== prev.connected && retry());
useSettings.subscribe((s, prev) => s.offlineMode !== prev.offlineMode && retry());
