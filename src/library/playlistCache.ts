// Which songs each of your playlists has, kept on the phone so Add to playlist shows its ticks
// at once instead of asking every playlist each time it opens.
//
// It stays in step with the server:
// - A cheap check (one request: every playlist's song count and Etag, which Jellyfin changes
//   whenever a playlist is saved, by any app) finds the playlists that changed; only those are
//   fetched again (ids only, see getPlaylistMembership).
// - That check runs at launch, when Rakki comes back to the front, every 15 minutes while it's
//   open, and each time Add to playlist opens.
// - Every playlist change Rakki makes (add, remove, move, create, delete; from anywhere) marks
//   that playlist for fetching right away (lib/events → onPlaylistsChanged).
// - Every playlist is fetched in full every 6 hours regardless, in case a change ever slipped
//   past the Etag.
// - Saving in Add to playlist never trusts it: Done asks the server for the playlists it's
//   about to change first (refreshPlaylist).
// Stored per user in the phone's preferences (ids only: ~250 KB for 3,400 songs).
import { AppState } from 'react-native';
import { create } from 'zustand';

import type { BaseItem, PlaylistEntry } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { onPlaylistsChanged } from '@/lib/events';
import { isOffline } from '@/lib/online';
import { readPref, writePref } from '@/lib/prefs';

const CHECK_EVERY_MS = 15 * 60_000;
const FRONT_CHECK_AFTER_MS = 5 * 60_000;
const FULL_EVERY_MS = 6 * 3600_000;
/** Add to playlist opening checks again unless a check just ran. */
const RECENT_MS = 20_000;
const PARALLEL = 2;

/** A playlist's songs: [song id, entry id] (an entry is one place in the playlist). */
type Pair = [string, string];

interface CachedPlaylist {
  /** Song count and Etag when fetched ('' when unknown: the next check fetches it again). */
  stamp: string;
  at: number;
  pairs: Pair[];
}

interface Stored {
  v: 1;
  server: string;
  lists: Record<string, CachedPlaylist>;
}

interface PlaylistCacheState {
  lists: Record<string, CachedPlaylist>;
  checkedAt: number;
  syncing: boolean;
}

export const usePlaylistCache = create<PlaylistCacheState>(() => ({ lists: {}, checkedAt: 0, syncing: false }));

const keyFor = (userId: string) => `rakki.playlistCache.${userId}`;
const stampOf = (p: BaseItem) => `${p.ChildCount ?? '?'}|${p.Etag ?? '?'}`;
const toEntries = (pairs: Pair[]): PlaylistEntry[] => pairs.map(([Id, entry]) => ({ Id, PlaylistItemId: entry || undefined }));

let user: string | null = null;
let server: string | null = null;
/** Playlists Rakki just changed: fetched on the next check whatever their stamp says. */
const dirty = new Set<string>();
let again = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let soonTimer: ReturnType<typeof setTimeout> | null = null;

/** The songs a playlist has, from the phone; undefined until it has been fetched once. */
export function cachedEntries(playlistId: string): PlaylistEntry[] | undefined {
  const c = usePlaylistCache.getState().lists[playlistId];
  return c ? toEntries(c.pairs) : undefined;
}

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!user || !server) return;
    const stored: Stored = { v: 1, server, lists: usePlaylistCache.getState().lists };
    writePref(keyFor(user), JSON.stringify(stored));
  }, 1000);
}

function put(playlistId: string, entry: CachedPlaylist | null) {
  usePlaylistCache.setState((s) => {
    const lists = { ...s.lists };
    if (entry) lists[playlistId] = entry;
    else delete lists[playlistId];
    return { lists };
  });
  persist();
}

/** Load what's stored for the signed-in user (a different user or server starts empty). */
function load() {
  const session = useAuth.getState().session;
  user = session?.userId ?? null;
  server = session?.serverUrl ?? null;
  let lists: Record<string, CachedPlaylist> = {};
  if (user && server) {
    try {
      const stored = JSON.parse(readPref(keyFor(user)) ?? 'null') as Stored | null;
      if (stored?.v === 1 && stored.server === server) lists = stored.lists;
    } catch {
      // Start again.
    }
  }
  dirty.clear();
  usePlaylistCache.setState({ lists, checkedAt: 0, syncing: false });
}

/**
 * Bring the cache up to date: ask for every playlist's stamp, fetch the ones that changed (or
 * are marked, or are 6 hours old). `force`: fetch every playlist.
 */
export async function syncPlaylists(force = false): Promise<void> {
  const client = useAuth.getState().client;
  if (!client || client.session.userId !== user || isOffline()) return;
  if (usePlaylistCache.getState().syncing) {
    again = true;
    return;
  }
  usePlaylistCache.setState({ syncing: true });
  try {
    const playlists = (await client.getPlaylists()).Items;
    const now = Date.now();
    const current = usePlaylistCache.getState().lists;
    // Deleted playlists go.
    for (const id of Object.keys(current)) if (!playlists.some((p) => p.Id === id)) put(id, null);
    const stale = playlists.filter((p) => {
      const c = current[p.Id];
      return force || !c || dirty.has(p.Id) || c.stamp !== stampOf(p) || now - c.at > FULL_EVERY_MS;
    });
    for (let i = 0; i < stale.length; i += PARALLEL) {
      await Promise.all(
        stale.slice(i, i + PARALLEL).map(async (p) => {
          // Clear the mark first: a change made while this fetch runs marks it again.
          dirty.delete(p.Id);
          // The stamp was read before the songs, so a change in between shows up next time.
          const entries = await client.getPlaylistMembership(p.Id);
          put(p.Id, { stamp: stampOf(p), at: Date.now(), pairs: entries.map((e) => [e.Id, e.PlaylistItemId ?? '']) });
        }),
      );
    }
    usePlaylistCache.setState({ checkedAt: Date.now() });
  } catch {
    // Offline or the server hiccuped: what's stored stays, and the next check tries again.
  } finally {
    usePlaylistCache.setState({ syncing: false });
    if (again) {
      again = false;
      void syncPlaylists();
    }
  }
}

/** Check soon (several changes in a row become one check). */
function syncSoon(delay = 400) {
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => {
    soonTimer = null;
    void syncPlaylists();
  }, delay);
}

/** Add to playlist opened: check, unless a check has just run. */
export function checkPlaylistsNow() {
  if (Date.now() - usePlaylistCache.getState().checkedAt > RECENT_MS || dirty.size) void syncPlaylists();
}

/**
 * Straight from the server (for saving): the playlist's songs right now. The cache takes them
 * too, without a stamp, so the next check confirms it.
 */
export async function refreshPlaylist(playlistId: string): Promise<PlaylistEntry[]> {
  const client = useAuth.getState().client;
  if (!client) throw new Error('Not signed in');
  const entries = await client.getPlaylistMembership(playlistId);
  if (client.session.userId === user) {
    put(playlistId, { stamp: '', at: Date.now(), pairs: entries.map((e) => [e.Id, e.PlaylistItemId ?? '']) });
  }
  return entries;
}

/**
 * A playlist page loaded the full list: take it if it's newer than what's stored (the stamp
 * stays, so the next check still compares against the server).
 */
export function noteLoadedPlaylist(playlistId: string, items: BaseItem[], loadedAt: number) {
  const c = usePlaylistCache.getState().lists[playlistId];
  if (!c || loadedAt <= c.at) return;
  put(playlistId, { stamp: c.stamp, at: loadedAt, pairs: items.map((i) => [i.Id, i.PlaylistItemId ?? '']) });
}

let started = false;

/** At sign-in (the root layout, whenever the user changes). */
export function startPlaylistCache() {
  load();
  syncSoon(5000);
  if (started) return;
  started = true;
  onPlaylistsChanged((ids) => {
    if (ids) for (const id of ids) dirty.add(id);
    syncSoon();
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && Date.now() - usePlaylistCache.getState().checkedAt > FRONT_CHECK_AFTER_MS) syncSoon(1500);
  });
  setInterval(() => {
    if (AppState.currentState === 'active') void syncPlaylists();
  }, CHECK_EVERY_MS);
}
