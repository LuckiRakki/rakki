import { QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/auth/store';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1 } },
});

const PAGE = 60;

function useClient() {
  return useAuth((s) => s.client);
}

export function useAlbums(sortBy = 'SortName', sortOrder = 'Ascending') {
  const client = useClient();
  return useInfiniteQuery({
    queryKey: ['albums', client?.session.userId, sortBy, sortOrder],
    enabled: !!client,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      client!.getAlbums({ startIndex: pageParam, limit: PAGE, sortBy, sortOrder }),
    getNextPageParam: (last) => {
      const next = last.StartIndex + last.Items.length;
      return last.Items.length > 0 && next < last.TotalRecordCount ? next : undefined;
    },
  });
}

export function useRecentlyAdded() {
  const client = useClient();
  return useQuery({
    queryKey: ['recentlyAdded', client?.session.userId],
    enabled: !!client,
    queryFn: async () =>
      (await client!.getAlbums({ sortBy: 'DateCreated', sortOrder: 'Descending', limit: 16 }))
        .Items,
  });
}

export function useRecentlyPlayed() {
  const client = useClient();
  return useQuery({
    queryKey: ['recentlyPlayed', client?.session.userId],
    enabled: !!client,
    queryFn: () => client!.getRecentlyPlayedAlbums(14),
  });
}

export function useItem(id: string | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ['item', client?.session.userId, id],
    enabled: !!client && !!id,
    queryFn: () => client!.getItem(id!),
  });
}

export function useAlbumTracks(albumId: string | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ['albumTracks', client?.session.userId, albumId],
    enabled: !!client && !!albumId,
    queryFn: async () => (await client!.getAlbumTracks(albumId!)).Items,
  });
}

// ---- Phase 3 ---------------------------------------------------------------------------

/** A query keyed to the signed-in user, enabled only while signed in. */
function useUserQuery<T>(key: unknown[], fn: (client: NonNullable<ReturnType<typeof useClient>>) => Promise<T>, enabled = true) {
  const client = useClient();
  return useQuery({
    queryKey: [key[0], client?.session.userId, ...key.slice(1)],
    enabled: !!client && enabled,
    queryFn: () => fn(client!),
  });
}

export const useMostPlayed = () => useUserQuery(['mostPlayed'], (c) => c.getMostPlayedAlbums(16));
export const useRediscover = () => useUserQuery(['rediscover'], (c) => c.getRediscoverAlbums(16));
export const useRandomAlbums = () => useUserQuery(['randomAlbums'], (c) => c.getRandomAlbums(16));
export const useLikedSongs = () => useUserQuery(['likedSongs'], async (c) => (await c.getFavoriteTracks()).Items);

export function useAlbumArtists() {
  const client = useClient();
  return useInfiniteQuery({
    queryKey: ['albumArtists', client?.session.userId],
    enabled: !!client,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => client!.getAlbumArtists({ startIndex: pageParam, limit: 100 }),
    getNextPageParam: (last) => {
      const next = last.StartIndex + last.Items.length;
      return last.Items.length > 0 && next < last.TotalRecordCount ? next : undefined;
    },
  });
}

export const useArtistAlbums = (id?: string) =>
  useUserQuery(['artistAlbums', id], async (c) => (await c.getArtistAlbums(id!)).Items, !!id);
export const useAppearsOn = (id?: string) => useUserQuery(['appearsOn', id], (c) => c.getAppearsOn(id!), !!id);
export const useTopTracks = (id?: string) => useUserQuery(['topTracks', id], (c) => c.getTopTracks(id!, 10), !!id);
export const useSimilar = (id?: string) => useUserQuery(['similar', id], (c) => c.getSimilar(id!, 12), !!id);

export function useGenreCounts() {
  const client = useClient();
  return useQuery({
    queryKey: ['genreCounts', client?.session.userId],
    enabled: !!client,
    staleTime: 24 * 60 * 60_000,
    queryFn: () => client!.getGenreCounts(),
  });
}
export const useGenreAlbums = (genre?: string) =>
  useUserQuery(['genreAlbums', genre], async (c) => (await c.getGenreAlbums(genre!)).Items, !!genre);

export const usePlaylists = () => useUserQuery(['playlists'], async (c) => (await c.getPlaylists()).Items);
export const usePlaylistItems = (id?: string) =>
  useUserQuery(['playlistItems', id], async (c) => (await c.getPlaylistItems(id!)).Items, !!id);

export function useSearch(term: string) {
  const t = term.trim();
  return useUserQuery(['search', t.toLowerCase()], (c) => c.search(t, 20), t.length >= 2);
}
