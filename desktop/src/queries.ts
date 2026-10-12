// What the screens show, fetched with the shared Jellyfin client and kept by React Query
// (each answer is reused while fresh, so going back is instant and nothing is asked twice).
import { QueryClient, useQuery } from '@tanstack/react-query';

import type { BaseItem, JellyfinClient } from '@/api/jellyfin';
import { isMix, mixNumber } from '@/lib/mixes';
import { useAuth } from '~/auth/session';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false, retry: 1 } },
});

function useClientQuery<T>(key: unknown[], fn: (c: JellyfinClient) => Promise<T>, enabled = true) {
  const client = useAuth((s) => s.client);
  return useQuery({
    queryKey: [key[0], client?.session.userId, ...key.slice(1)],
    enabled: !!client && enabled,
    queryFn: () => fn(client!),
  });
}

const allPlaylists = (c: JellyfinClient) => c.getPlaylists().then((r) => r.Items);

export const useRecentlyPlayed = () => useClientQuery(['recentlyPlayed'], (c) => c.getRecentlyPlayedAlbums(12));
export const useRecentlyAdded = () =>
  useClientQuery(['recentlyAdded'], (c) => c.getAlbums({ sortBy: 'DateCreated,SortName', sortOrder: 'Descending', limit: 16 }).then((r) => r.Items));
export const useMostPlayed = () => useClientQuery(['mostPlayed'], (c) => c.getMostPlayedAlbums(16));
export const useTopArtists = () => useClientQuery(['topArtists'], (c) => c.getTopArtists(12));
export const usePlaylists = () => useClientQuery(['playlists'], async (c) => (await allPlaylists(c)).filter((p) => !isMix(p)));
export const useDailyMixes = () =>
  useClientQuery(['mixes'], async (c) => (await allPlaylists(c)).filter(isMix).sort((a, b) => mixNumber(a) - mixNumber(b)));

export const useAllAlbums = () =>
  useClientQuery(['allAlbums'], (c) => c.getAlbums({ sortBy: 'SortName', sortOrder: 'Ascending', limit: 10000 }).then((r) => r.Items));
export const useAllArtists = () =>
  useClientQuery(['allArtists'], (c) => c.getAlbumArtists({ sortBy: 'SortName', sortOrder: 'Ascending', limit: 10000 }).then((r) => r.Items));
export const useLiked = () => useClientQuery(['liked'], (c) => c.getFavoriteTracks({ limit: 5000 }).then((r) => r.Items));

export const useItem = (id?: string) => useClientQuery(['item', id], (c) => c.getItem(id!), !!id);
export const useAlbumTracks = (id: string) => useClientQuery(['albumTracks', id], (c) => c.getAlbumTracks(id).then((r) => r.Items));
export const usePlaylistTracks = (id: string) => useClientQuery(['playlistItems', id], (c) => c.getPlaylistItems(id).then((r) => r.Items));
export const useArtistAlbums = (id: string) => useClientQuery(['artistAlbums', id], (c) => c.getArtistAlbums(id).then((r) => r.Items));
export const useTopTracks = (id: string) => useClientQuery(['topTracks', id], (c) => c.getTopTracks(id, 10));
export const useSimilarArtists = (id: string) => useClientQuery(['similar', id], (c) => c.getSimilar(id, 12));

export const useAllSongs = () =>
  useClientQuery(['allSongs'], (c) => c.getTracks({ sortBy: 'Album,ParentIndexNumber,IndexNumber', sortOrder: 'Ascending', limit: 20000 }).then((r) => r.Items));
export const useGenres = () => useClientQuery(['genres'], (c) => c.getGenreCounts());
export const useGenreAlbums = (genre: string) => useClientQuery(['genreAlbums', genre], (c) => c.getGenreAlbums(genre).then((r) => r.Items));
export const useGenreTopSongs = (genre: string) => useClientQuery(['genreTop', genre], (c) => c.getGenreTracks(genre, { mostPlayed: true, limit: 20 }).then((r) => r.Items));
export const useRediscover = () => useClientQuery(['rediscover'], (c) => c.getRediscoverAlbums(16));
export const useRandomAlbums = () => useClientQuery(['randomAlbums'], (c) => c.getRandomAlbums(16));
export const useAppearsOn = (id: string) => useClientQuery(['appearsOn', id], (c) => c.getAppearsOn(id));
export const useArtistTracks = (id: string) => useClientQuery(['artistTracks', id], (c) => c.getArtistTracks(id));

export const useSearch = (term: string) =>
  useClientQuery(['search', term], (c) => c.search(term, 20), term.trim().length > 1);

export type { BaseItem };
