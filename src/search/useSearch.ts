// Search results: Jellyfin's own search (exact substrings, always up to date) merged with
// the on-device fuzzy index (typos), then ranked together by one scoring function.
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { BaseItem, GenreCount, JellyfinClient, SearchKind } from '@/api/jellyfin';
import { useGenreCounts } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { artistLine } from '@/lib/items';
import { fuzzySearch, prepare, scoreName, type FuzzyIndex, type Kind } from '@/search/fuzzy';
import { useSearchIndex } from '@/search/index';

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
  const by = item.Type === 'Audio' ? artistLine(item) : item.Type === 'MusicAlbum' ? item.AlbumArtist : undefined;
  return scoreName({ id: item.Id, kind: item.Type as Kind, name: item.Name, by }, term);
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

async function runSearch(client: JellyfinClient, term: string, filter: Filter, genres: GenreCount[]): Promise<SearchResults> {
  const limit = filter === 'all' ? 20 : 100;
  const kinds = filter === 'all' ? ALL_KINDS : filter === 'genres' ? [] : [filter];
  const index = useSearchIndex.getState().index;
  const fuzzy = index ? fuzzySearch(index, term, limit).filter((m) => kinds.includes(KIND_OF[m.entry.kind]!)) : [];
  const fuzzyScore = new Map(fuzzy.map((m) => [m.entry.id, m.score]));

  const [server, fetched] = await Promise.all([
    kinds.length ? client.search(term, limit, kinds) : null,
    client.getItemsByIds(fuzzy.map((m) => m.entry.id)),
  ]);

  const lists: Record<SearchKind, { item: BaseItem; score: number }[]> = { songs: [], artists: [], albums: [], playlists: [] };
  const seen = new Set<string>();
  const all = [...fetched, ...(server ? [...server.songs, ...server.albums, ...server.artists, ...server.playlists] : [])];
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

  const byName = new Map(genres.map((g) => [g.name, g]));
  const genreHits =
    filter === 'all' || filter === 'genres'
      ? fuzzySearch(genreIndex(genres), term, filter === 'all' ? 8 : 100).map((m) => byName.get(m.entry.id)!)
      : [];

  return {
    top,
    songs: songs.map((x) => x.item),
    artists: artists.map((x) => x.item),
    albums: albums.map((x) => x.item),
    playlists: playlists.map((x) => x.item),
    genres: genreHits,
  };
}

export function useSearchResults(term: string, filter: Filter) {
  const client = useAuth((s) => s.client);
  const version = useSearchIndex((s) => s.version);
  const genres = useGenreCounts().data;
  const t = term.trim();
  return useQuery({
    queryKey: ['search', client?.session.userId, t.toLowerCase(), filter, version, genres?.length ?? 0],
    enabled: !!client && t.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: () => runSearch(client!, t, filter, genres ?? []),
  });
}
