// The Rakki companion plugin on the server (server/ in this repo). For now it shares the
// Last.fm key: whichever side has one fills in the other, so it's only entered once.
// - At sign-in: the server has a key and the phone doesn't, the phone takes it; the phone has
//   one and the server doesn't, the server takes it. Both have one: left alone.
// - Changing the key in Settings → Last.fm sends it to the server (a few seconds after the
//   last keystroke; the server checks it with Last.fm and ignores one that doesn't work).
// Only administrators can read or set the server's key; for anyone else this does nothing,
// as it does when the server doesn't have the plugin.
import { useAuth } from '@/auth/store';
import { isOffline } from '@/lib/online';
import { useSettings } from '@/settings/store';

const PUSH_AFTER_MS = 3000;

let fromServer: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

async function push(key: string) {
  const client = useAuth.getState().client;
  if (!client || isOffline()) return;
  try {
    await client.setRakkiLastfmKey(key);
  } catch {
    // No plugin, not an administrator, or a key Last.fm turned down: nothing to do.
  }
}

/** At sign-in: fill in whichever side has no key. */
export async function syncLastfmKey() {
  const client = useAuth.getState().client;
  if (!client || isOffline()) return;
  let info;
  try {
    info = await client.getRakkiInfo();
  } catch {
    return;
  }
  const local = useSettings.getState().lastfmApiKey.trim();
  if (info.LastFmKeySet && !local) {
    try {
      const { Key } = await client.getRakkiLastfmKey();
      if (Key && !useSettings.getState().lastfmApiKey.trim()) {
        fromServer = Key;
        useSettings.getState().set('lastfmApiKey', Key);
      }
    } catch {
      // Not an administrator.
    }
  } else if (!info.LastFmKeySet && local) {
    await push(local);
  }
}

let started = false;

/** Once: changes made in Settings go to the server too. */
export function startCompanionSync() {
  if (started) return;
  started = true;
  useSettings.subscribe((s, prev) => {
    const key = s.lastfmApiKey.trim();
    if (key === prev.lastfmApiKey.trim()) return;
    if (pushTimer) clearTimeout(pushTimer);
    // The key the server just gave us needn't go back.
    if (!key || key === fromServer) return;
    pushTimer = setTimeout(() => {
      pushTimer = null;
      void push(key);
    }, PUSH_AFTER_MS);
  });
}
