// The on-device name index behind fuzzy search: every song, album, artist and playlist,
// name + artist only. Building it means downloading the whole library listing (~6 MB for
// 7k songs, about 30 s over Tailscale), so it's built once in the background, stored on the
// device, then topped up with only what changed. A full rebuild runs weekly to drop deleted
// items (until then they're skipped, because results are fetched fresh by id).
import { create } from 'zustand';

import type { BaseItem, JellyfinClient } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { isOffline } from '@/lib/online';
import { readPref, writePref } from '@/lib/prefs';
import { prepare, type Entry, type FuzzyIndex, type Kind } from '@/search/fuzzy';

const PAGE = 1000;
const FULL_EVERY = 7 * 24 * 3600_000;
const UPDATE_EVERY = 3 * 3600_000;

const KINDS: Kind[] = ['Audio', 'MusicAlbum', 'MusicArtist', 'Playlist'];
/** [id, kind (index into KINDS), name, artist?] */
type Row = [string, number, string] | [string, number, string, string];

interface Stored {
  v: 1;
  server: string;
  user: string;
  fullAt: number;
  updatedAt: number;
  rows: Row[];
}

const keyFor = (userId: string) => `rakki.searchIndex.${userId}`;
let stored: Stored | null = null;

export const useSearchIndex = create<{ index: FuzzyIndex | null; version: number; syncing: boolean }>(() => ({
  index: null,
  version: 0,
  syncing: false,
}));

function toEntries(rows: Row[]): Entry[] {
  return rows.map((r) => ({ id: r[0], kind: KINDS[r[1]], name: r[2], by: r[3] }));
}

function publish(s: Stored) {
  stored = s;
  useSearchIndex.setState((st) => ({ index: prepare(toEntries(s.rows)), version: st.version + 1 }));
}

function load(client: JellyfinClient): Stored | null {
  try {
    const s = JSON.parse(readPref(keyFor(client.session.userId)) ?? 'null') as Stored | null;
    return s && s.v === 1 && s.server === client.session.serverUrl && s.user === client.session.userId ? s : null;
  } catch {
    return null;
  }
}

function addRows(items: BaseItem[], rows: Map<string, Row>) {
  for (const it of items) {
    const kind = it.Type === 'Audio' ? 0 : it.Type === 'MusicAlbum' ? 1 : it.Type === 'Playlist' ? 3 : -1;
    if (kind < 0 || !it.Name) continue;
    const by = kind === 0 ? it.Artists?.join(', ') || it.AlbumArtist : kind === 1 ? it.AlbumArtist : undefined;
    rows.set(it.Id, by ? [it.Id, kind, it.Name, by] : [it.Id, kind, it.Name]);
    // Artists come from the songs and albums themselves, so no separate artist download.
    for (const a of [...(it.ArtistItems ?? []), ...(it.AlbumArtists ?? [])]) {
      if (a.Id && a.Name && !rows.has(a.Id)) rows.set(a.Id, [a.Id, 2, a.Name]);
    }
  }
}

async function addAll(client: JellyfinClient, kind: 'Audio' | 'MusicAlbum' | 'Playlist', rows: Map<string, Row>, since?: string) {
  for (let start = 0; ; ) {
    const page = await client.getIndexPage(kind, start, PAGE, since);
    addRows(page.Items, rows);
    start += page.Items.length;
    if (page.Items.length < PAGE || start >= page.TotalRecordCount) return;
  }
}

/**
 * Load the stored index (if any) and bring it up to date in the background. Safe to call
 * often: it does nothing while a sync is running or when the index is fresh.
 */
export async function ensureSearchIndex(): Promise<void> {
  const client = useAuth.getState().client;
  if (!client || useSearchIndex.getState().syncing) return;
  if (isOffline()) {
    // Offline: just load what's stored (offline search uses the downloads anyway).
    if (!stored) {
      const s = load(client);
      if (s) publish(s);
    }
    return;
  }
  if (!stored || stored.user !== client.session.userId) {
    stored = null;
    const s = load(client);
    if (s) publish(s);
    else useSearchIndex.setState({ index: null });
  }

  const now = Date.now();
  const full = !stored || now - stored.fullAt >= FULL_EVERY;
  if (!full && stored && now - stored.updatedAt < UPDATE_EVERY) return;

  useSearchIndex.setState({ syncing: true });
  try {
    const rows = new Map<string, Row>();
    let since: string | undefined;
    if (!full && stored) {
      for (const r of stored.rows) rows.set(r[0], r);
      since = new Date(stored.updatedAt - 10 * 60_000).toISOString();
    }
    await addAll(client, 'Playlist', rows, since);
    await addAll(client, 'MusicAlbum', rows, since);
    await addAll(client, 'Audio', rows, since);
    // Signed out or switched user while this ran: throw the result away.
    if (useAuth.getState().client?.session.userId !== client.session.userId) return;
    const next: Stored = {
      v: 1,
      server: client.session.serverUrl,
      user: client.session.userId,
      fullAt: full ? now : stored!.fullAt,
      updatedAt: now,
      rows: [...rows.values()],
    };
    writePref(keyFor(next.user), JSON.stringify(next));
    publish(next);
  } catch {
    // Offline or the server hiccuped: keep what we have and try again next time.
  } finally {
    useSearchIndex.setState({ syncing: false });
  }
}
