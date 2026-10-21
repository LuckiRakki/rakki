// The quick search: what Rakki already has on hand (every song, album, artist and playlist the
// pages have loaded, kept between launches, plus the downloads), matched on the device with no
// server. It answers at once, so results show while the full search (or the index being built
// behind it) is still on its way, and when the server is slow or doesn't answer.
import type { QueryClient } from '@tanstack/react-query';

import type { BaseItem } from '@/api/jellyfin';
import { downloadedAlbums, downloadedArtists, downloadedPlaylists, downloadedTracks } from '@/downloads/offline';
import { artistLine } from '@/lib/items';
import { isMix } from '@/lib/mixes';
import { prepare, type Entry, type FuzzyIndex, type Kind } from '@/search/fuzzy';

const KINDS = new Set(['Audio', 'MusicAlbum', 'MusicArtist', 'Playlist']);
/** Collected again at most this often (walking the cache is cheap, but not per keystroke). */
const FRESH_MS = 10_000;

const isItem = (v: unknown): v is BaseItem => {
  const o = v as BaseItem;
  return typeof o?.Id === 'string' && typeof o.Name === 'string' && KINDS.has(o.Type) && !isMix(o);
};

/** Every library item in `value` (a query's answer: lists, pages, items holding items). */
function collect(value: unknown, out: Map<string, BaseItem>, depth: number) {
  if (!value || typeof value !== 'object' || depth > 4) return;
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out, depth + 1);
    return;
  }
  if (isItem(value) && !out.has(value.Id)) out.set(value.Id, value);
  for (const v of Object.values(value)) if (v && typeof v === 'object') collect(v, out, depth + 1);
}

export function entryOf(item: BaseItem): Entry {
  const by = item.Type === 'Audio' ? artistLine(item) : item.Type === 'MusicAlbum' ? item.AlbumArtist : undefined;
  return { id: item.Id, kind: item.Type as Kind, name: item.Name, by };
}

let known: { at: number; byId: Map<string, BaseItem>; index: FuzzyIndex } | null = null;

/** What's on hand, by id, and its fuzzy index (rebuilt every few seconds at most). */
export function knownItems(queryClient: QueryClient): { byId: Map<string, BaseItem>; index: FuzzyIndex } {
  if (known && Date.now() - known.at < FRESH_MS) return known;
  const byId = new Map<string, BaseItem>();
  for (const item of [...downloadedTracks(), ...downloadedAlbums(), ...downloadedArtists(), ...downloadedPlaylists()]) byId.set(item.Id, item);
  for (const q of queryClient.getQueryCache().getAll()) collect(q.state.data, byId, 0);
  known = { at: Date.now(), byId, index: prepare([...byId.values()].map(entryOf)) };
  return known;
}
