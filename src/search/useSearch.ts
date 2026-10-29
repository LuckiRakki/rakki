// Search results: Jellyfin's own search (exact substrings, always up to date) merged with
// the on-device fuzzy index (typos), then ranked together by one scoring function; the quick
// search (search/quick.ts) shows until that answers.
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { BaseItem, GenreCount, JellyfinClient, SearchKind } from '@/api/jellyfin';
import { useGenreCounts } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { downloadedAlbums, downloadedArtists, downloadedPlaylists, downloadedTracks } from '@/downloads/offline';
import { useDownloads } from '@/downloads/store';
import { isOffline, useOffline } from '@/lib/online';
import { fuzzySearch, prepare, scoreName, type FuzzyIndex } from '@/search/fuzzy';
import { useSearchIndex, whileSearching } from '@/search/index';
import { entryOf, knownItems } from '@/search/quick';

export type Filter = 'all' | SearchKind | 'genres';
export const ALL_KINDS: SearchKind[] = ['songs', 'artists', 'albums', 'playlists'];

export interface SearchResults {
  top: BaseItem | null;
  songs: BaseItem[];
  artists: BaseItem[];
  albums: BaseItem[];
  playlists: BaseItem[];
  genres: GenreCount[];
}

const KIND_OF: Record<string, SearchKind | undefined> = {
  Audio: 'songs',
  MusicAlbum: 'albums',
  MusicArtist: 'artists',
  Playlist: 'playlists',
};

function score(item: BaseItem, term: string): number {
  return scoreName(entryOf(item), term);
}

const genreIndexes = new WeakMap<GenreCount[], FuzzyIndex>();
function genreIndex(genres: GenreCount[]): FuzzyIndex {
  let index = genreIndexes.get(genres);
  if (!index) {
    index = prepare(genres.map((g) => ({ id: g.name, kind: 'Genre' as const, name: g.name })));
    genreIndexes.set(genres, index);
  }
  return index;
}

/** Matching over items already on hand (no server), ranked the same way. */
function localSearch(index: FuzzyIndex, byId: Map<string, BaseItem>, term: string, filter: Filter, genres: GenreCount[] = []): SearchResults {
  const limit = filter === 'all' ? 20 : 100;
  const kinds = filter === 'all' ? ALL_KINDS : filter === 'genres' ? [] : [filter];
  const matches = fuzzySearch(index, term, limit).filter((m) => kinds.includes(KIND_OF[m.entry.kind]!) && byId.has(m.entry.id));
  const of = (k: SearchKind) => matches.filter((m) => KIND_OF[m.entry.kind] === k).map((m) => byId.get(m.entry.id)!);
  return {
    top: filter === 'all' && matches[0] ? byId.get(matches[0].entry.id)! : null,
    songs: of('songs'),
    artists: of('artists'),
    albums: of('albums'),
    playlists: of('playlists'),
    genres: genreHits(genres, term, filter),
  };
}

function genreHits(genres: GenreCount[], term: string, filter: Filter): GenreCount[] {
  if (filter !== 'all' && filter !== 'genres') return [];
  const byName = new Map(genres.map((g) => [g.name, g]));
  return fuzzySearch(genreIndex(genres), term, filter === 'all' ? 8 : 100).map((m) => byName.get(m.entry.id)!);
}

/** Offline: the same matching over what's downloaded. */
function offlineSearch(term: string, filter: Filter): SearchResults {
  const byId = new Map<string, BaseItem>();
  for (const item of [...downloadedTracks(), ...downloadedAlbums(), ...downloadedArtists(), ...downloadedPlaylists()]) byId.set(item.Id, item);
  return localSearch(prepare([...byId.values()].map(entryOf)), byId, term, filter);
}

const hasAny = (r: SearchResults) => !!(r.songs.length || r.artists.length || r.albums.length || r.playlists.length || r.genres.length);

/** The quick search (search/quick.ts), or null when it finds nothing. */
function quickSearch(queryClient: QueryClient, term: string, filter: Filter, genres: GenreCount[]): SearchResults | null {
  const known = knownItems(queryClient);
  const r = localSearch(known.index, known.byId, term, filter, genres);
  return hasAny(r) ? r : null;
}

async function runSearch(
  client: JellyfinClient,
  queryClient: QueryClient,
  term: string,
  filter: Filter,
  signal: AbortSignal,
): Promise<Omit<SearchResults, 'genres'>> {
  if (isOffline()) return offlineSearch(term, filter);
  const limit = filter === 'all' ? 20 : 100;
  const kinds = filter === 'all' ? ALL_KINDS : filter === 'genres' ? [] : [filter];
  // The server is asked first, so the typo matching below happens while it answers. Index
  // paging waits meanwhile, so a search isn't stuck behind a library download.
  const asking = whileSearching(kinds.length ? client.search(term, limit, kinds, signal) : Promise.resolve(null));
  const index = useSearchIndex.getState().index;
  const fuzzy = index ? fuzzySearch(index, term, limit).filter((m) => kinds.includes(KIND_OF[m.entry.kind]!)) : [];
  const fuzzyScore = new Map(fuzzy.map((m) => [m.entry.id, m.score]));
  // Typo matches the pages have already loaded aren't asked for again (usually most of them).
  const known = knownItems(queryClient).byId;
  const onHand = fuzzy.flatMap((m) => known.get(m.entry.id) ?? []);
  const missing = fuzzy.filter((m) => !known.has(m.entry.id)).map((m) => m.entry.id);
  const [server, fetched] = await Promise.all([asking, whileSearching(client.getItemsByIds(missing, signal))]);

  const lists: Record<SearchKind, { item: BaseItem; score: number }[]> = { songs: [], artists: [], albums: [], playlists: [] };
  const seen = new Set<string>();
  // Fresh copies from the server first, so they win over what was on hand.
  const all = [...(server ? [...server.songs, ...server.albums, ...server.artists, ...server.playlists] : []), ...fetched, ...onHand];
  for (const item of all) {
    const kind = KIND_OF[item.Type];
    if (!kind || !kinds.includes(kind) || seen.has(item.Id)) continue;
    seen.add(item.Id);
    // The server matched it even if our scoring doesn't (e.g. on a field we don't index).
    const base = fuzzyScore.get(item.Id) ?? Math.max(score(item, term), 50);
    // Among equally good matches, what you play most comes first.
    const plays = Math.min(4, Math.log2(1 + (item.UserData?.PlayCount ?? 0)));
    lists[kind].push({ item, score: base + plays });
  }
  const ranked = (k: SearchKind) => lists[k].sort((a, b) => b.score - a.score).slice(0, limit);
  const songs = ranked('songs');
  const artists = ranked('artists');
  const albums = ranked('albums');
  const playlists = ranked('playlists');

  const top =
    filter === 'all'
      ? ([songs[0], artists[0], albums[0], playlists[0]].filter(Boolean).sort((a, b) => b.score - a.score)[0]?.item ?? null)
      : null;

  return {
    top,
    songs: songs.map((x) => x.item),
    artists: artists.map((x) => x.item),
    albums: albums.map((x) => x.item),
    playlists: playlists.map((x) => x.item),
  };
}

/** `value`, once it has stopped changing for `ms`. */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), Math.max(0, ms));
    return () => clearTimeout(id);
  }, [value, ms]);
  return ms <= 0 ? value : settled;
}

/**
 * Results for a search. The full search asks the server; until it answers (or if it can't),
 * the quick search over what's already on hand shows, so a slow server or an index still
 * being built never leaves the page waiting. `quick` says which one is showing.
 *
 * `settleMs`: wait for typing to pause this long before asking the server (the quick search
 * still follows every key). A search that's typed over is cancelled, so it doesn't hold up
 * the next one.
 */
export function useSearchResults(term: string, filter: Filter, { settleMs = 0 }: { settleMs?: number } = {}) {
  const client = useAuth((s) => s.client);
  const version = useSearchIndex((s) => s.version);
  const genres = useGenreCounts().data;
  const offline = useOffline();
  const rev = useDownloads((s) => s.rev);
  const queryClient = useQueryClient();
  const t = term.trim();
  const asked = useSettled(t, t ? settleMs : 0);
  const full = useQuery({
    queryKey: ['search', client?.session.userId, asked.toLowerCase(), filter, version, offline ? `offline:${rev}` : 'online'],
    enabled: !!client && asked.length > 0,
    networkMode: offline ? 'always' : 'online',
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) => runSearch(client!, queryClient, asked, filter, signal),
  });
  const current = asked.toLowerCase() === t.toLowerCase();
  const settled = current && !!full.data && !full.isPlaceholderData;
  const quick = !settled && !offline && t.length > 0 ? quickSearch(queryClient, t, filter, genres ?? []) : null;
  // Genres are matched on the device, so they follow the box without a server round trip.
  const withGenres = (r: Omit<SearchResults, 'genres'>): SearchResults => ({ ...r, genres: genreHits(genres ?? [], t, filter) });
  const data = settled ? withGenres(full.data!) : (quick ?? (full.data ? withGenres(full.data) : undefined));
  return {
    data,
    quick: !!quick,
    /** The full search is still asking the server. */
    waiting: full.isFetching || !current,
    /** Showing the last search's answer while this one loads. */
    isPlaceholderData: !settled && !quick && (full.isPlaceholderData || !current),
    isLoading: !settled && !quick && (full.isLoading || (!current && !full.data)),
    error: settled || quick ? null : full.error,
  };
}
