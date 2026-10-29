// What the screens show, fetched with the shared Jellyfin client and kept by React Query
// (each answer is reused while fresh, so going back is instant and nothing is asked twice).
import { QueryClient, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { cachedItem } from '@/api/cachedItem';
import type { BaseItem, JellyfinClient } from '@/api/jellyfin';
import { isMix, mixNumber } from '@/lib/mixes';
import { useAuth } from '~/auth/session';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false, retry: 1 } },
});

function useClientQuery<T, S = T>(key: unknown[], fn: (c: JellyfinClient) => Promise<T>, enabled = true, select?: (data: T) => S) {
  const client = useAuth((s) => s.client);
  return useQuery({
    queryKey: [key[0], client?.session.userId, ...key.slice(1)],
    enabled: !!client && enabled,
    queryFn: () => fn(client!),
    select,
  });
}

/** Every playlist, Daily Mixes too: one request for the sidebar, Home and the library. */
export const allPlaylistsKey = 'allPlaylists';
const allPlaylists = (c: JellyfinClient) => c.getPlaylists().then((r) => r.Items);
const onlyPlaylists = (all: BaseItem[]) => all.filter((p) => !isMix(p));
const onlyMixes = (all: BaseItem[]) => all.filter(isMix).sort((a, b) => mixNumber(a) - mixNumber(b));

export const useRecentlyPlayed = () => useClientQuery(['recentlyPlayed'], (c) => c.getRecentlyPlayedAlbums(12));
export const useRecentlyAdded = (on = true) =>
  useClientQuery(['recentlyAdded'], (c) => c.getAlbums({ sortBy: 'DateCreated,SortName', sortOrder: 'Descending', limit: 16 }).then((r) => r.Items), on);
export const useMostPlayed = (on = true) => useClientQuery(['mostPlayed'], (c) => c.getMostPlayedAlbums(16), on);
export const useTopArtists = (on = true) => useClientQuery(['topArtists'], (c) => c.getTopArtists(12), on);
export const usePlaylists = () => useClientQuery([allPlaylistsKey], allPlaylists, true, onlyPlaylists);
export const useDailyMixes = () => useClientQuery([allPlaylistsKey], allPlaylists, true, onlyMixes);

export const useAllAlbums = () =>
  useClientQuery(['allAlbums'], (c) => c.getAlbums({ sortBy: 'SortName', sortOrder: 'Ascending', limit: 10000 }).then((r) => r.Items));
export const useAllArtists = () =>
  useClientQuery(['allArtists'], (c) => c.getAlbumArtists({ sortBy: 'SortName', sortOrder: 'Ascending', limit: 10000 }).then((r) => r.Items));
export const useLiked = () => useClientQuery(['liked'], (c) => c.getFavoriteTracks({ limit: 5000 }).then((r) => r.Items));

/** An item's page: drawn at once from the list it was opened from (api/cachedItem.ts), then the full item. */
export function useItem(id?: string) {
  const client = useAuth((s) => s.client);
  const seen = useMemo(() => cachedItem(queryClient, id), [id]);
  return useQuery({
    queryKey: ['item', client?.session.userId, id],
    enabled: !!client && !!id,
    queryFn: () => client!.getItem(id!),
    placeholderData: seen,
  });
}
export const useAlbumTracks = (id: string) => useClientQuery(['albumTracks', id], (c) => c.getAlbumTracks(id).then((r) => r.Items));
export const usePlaylistTracks = (id: string) => useClientQuery(['playlistItems', id], (c) => c.getPlaylistItems(id).then((r) => r.Items));
export const useArtistAlbums = (id: string, on = true) => useClientQuery(['artistAlbums', id], (c) => c.getArtistAlbums(id).then((r) => r.Items), on);
export const useTopTracks = (id: string) => useClientQuery(['topTracks', id], (c) => c.getTopTracks(id, 10));
export const useSimilarArtists = (id: string) => useClientQuery(['similar', id], (c) => c.getSimilar(id, 12));

export const useAllSongs = () =>
  useClientQuery(['allSongs'], (c) => c.getTracks({ sortBy: 'Album,ParentIndexNumber,IndexNumber', sortOrder: 'Ascending', limit: 20000 }).then((r) => r.Items));
export const useGenres = () => useClientQuery(['genres'], (c) => c.getGenreCounts());
export const useGenreAlbums = (genre: string) => useClientQuery(['genreAlbums', genre], (c) => c.getGenreAlbums(genre).then((r) => r.Items));
export const useGenreTopSongs = (genre: string) => useClientQuery(['genreTop', genre], (c) => c.getGenreTracks(genre, { mostPlayed: true, limit: 20 }).then((r) => r.Items));
export const useRediscover = (on = true) => useClientQuery(['rediscover'], (c) => c.getRediscoverAlbums(16), on);
export const useRandomAlbums = (on = true) => useClientQuery(['randomAlbums'], (c) => c.getRandomAlbums(16), on);
export const useAppearsOn = (id: string) => useClientQuery(['appearsOn', id], (c) => c.getAppearsOn(id));
export const useArtistTracks = (id: string) => useClientQuery(['artistTracks', id], (c) => c.getArtistTracks(id));

export type { BaseItem };

/** You (name and profile picture tag), for your picture in the title bar and Settings. */
export const useMe = () => useClientQuery(['me'], (c) => c.getMe());
