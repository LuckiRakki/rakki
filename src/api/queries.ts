import { QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { BaseItem, ItemsResult, JellyfinClient } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import {
  downloadedAlbums,
  downloadedArtists,
  downloadedPlaylists,
  offlineAlbumTracks,
  offlineArtistAlbums,
  offlineArtistTracks,
  offlineGenreAlbums,
  offlineItem,
  offlineLikedTracks,
  offlinePlaylistTracks,
} from '@/downloads/offline';
import { useDownloads } from '@/downloads/store';
import { useOffline } from '@/lib/online';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1 } },
});

const PAGE = 60;

function useClient() {
  return useAuth((s) => s.client);
}

/**
 * The cache-key tail for online/offline. Offline answers come from the downloads, so their
 * key also follows what's downloaded; switching back online uses the server's cached answers.
 */
function useModeKey(): string {
  const offline = useOffline();
  const rev = useDownloads((s) => s.rev);
  return offline ? `offline:${rev}` : 'online';
}

/**
 * A query keyed to the signed-in user. Offline it answers from the downloads (`offline`), or
 * stays empty when there's no offline answer (the shelf or section just doesn't show).
 */
function useUserQuery<T>(
  key: unknown[],
  fn: (client: JellyfinClient) => Promise<T>,
  opts: { enabled?: boolean; offline?: () => T; staleTime?: number } = {},
) {
  const client = useClient();
  const mode = useModeKey();
  const offline = mode !== 'online';
  return useQuery({
    queryKey: [key[0], client?.session.userId, ...key.slice(1), mode],
    enabled: !!client && (opts.enabled ?? true) && (!offline || !!opts.offline),
    staleTime: offline ? Infinity : opts.staleTime,
    networkMode: offline ? 'always' : 'online',
    queryFn: () => (offline ? Promise.resolve(opts.offline!()) : fn(client!)),
  });
}

/** A paged list (Library tabs). Offline it's one page of what's downloaded. */
function usePagedQuery(
  key: unknown[],
  fetchPage: (client: JellyfinClient, start: number) => Promise<ItemsResult>,
  offline: () => BaseItem[],
) {
  const client = useClient();
  const mode = useModeKey();
  const isOffline = mode !== 'online';
  return useInfiniteQuery({
    queryKey: [key[0], client?.session.userId, ...key.slice(1), mode],
    enabled: !!client,
    initialPageParam: 0,
    networkMode: isOffline ? 'always' : 'online',
    queryFn: ({ pageParam }): Promise<ItemsResult> => {
      if (!isOffline) return fetchPage(client!, pageParam);
      const items = offline();
      return Promise.resolve({ Items: items, TotalRecordCount: items.length, StartIndex: 0 });
    },
    getNextPageParam: (last) => {
      const next = last.StartIndex + last.Items.length;
      return last.Items.length > 0 && next < last.TotalRecordCount ? next : undefined;
    },
  });
}

/** Offline sorting for the Library tabs (by name or artist; otherwise newest download first). */
function sortItems(items: BaseItem[], sortBy: string): BaseItem[] {
  const byText = (get: (x: BaseItem) => string) =>
    [...items].sort((a, b) => get(a).localeCompare(get(b), undefined, { sensitivity: 'base' }));
  if (sortBy.startsWith('AlbumArtist')) return byText((x) => x.AlbumArtist ?? '');
  if (sortBy.startsWith('SortName')) return byText((x) => x.Name);
  return items;
}

export const useAlbums = (sortBy = 'SortName', sortOrder = 'Ascending') =>
  usePagedQuery(
    ['albums', sortBy, sortOrder],
    (c, start) => c.getAlbums({ startIndex: start, limit: PAGE, sortBy, sortOrder }),
    () => sortItems(downloadedAlbums(), sortBy),
  );

export const useAlbumArtists = (sortBy = 'SortName', sortOrder = 'Ascending') =>
  usePagedQuery(
    ['albumArtists', sortBy, sortOrder],
    (c, start) => c.getAlbumArtists({ startIndex: start, limit: 100, sortBy, sortOrder }),
    downloadedArtists,
  );

export const useRecentlyAdded = () =>
  useUserQuery(['recentlyAdded'], async (c) => (await c.getAlbums({ sortBy: 'DateCreated', sortOrder: 'Descending', limit: 16 })).Items);

/** Home's quick picks + "Jump back in". Offline: the albums you downloaded. */
export const useRecentlyPlayed = () =>
  useUserQuery(['recentlyPlayed'], (c) => c.getRecentlyPlayedAlbums(14), { offline: downloadedAlbums });

/** Any item's page header. Offline: null when none of it is on the phone. */
export const useItem = (id: string | undefined) =>
  useUserQuery(['item', id], (c): Promise<BaseItem | null> => c.getItem(id!), {
    enabled: !!id,
    offline: () => offlineItem(id!),
  });

export const useAlbumTracks = (albumId: string | undefined) =>
  useUserQuery(['albumTracks', albumId], async (c) => (await c.getAlbumTracks(albumId!)).Items, {
    enabled: !!albumId,
    offline: () => offlineAlbumTracks(albumId!),
  });

export const useMostPlayed = () => useUserQuery(['mostPlayed'], (c) => c.getMostPlayedAlbums(16));
export const useRediscover = () => useUserQuery(['rediscover'], (c) => c.getRediscoverAlbums(16));

/** You (name + profile picture). Not tied to online/offline: the picture stays cached. */
export function useMe() {
  const client = useClient();
  return useQuery({
    queryKey: ['me', client?.session.userId],
    enabled: !!client,
    staleTime: 60 * 60_000,
    queryFn: () => client!.getMe(),
  });
}

export const useTopArtists = () =>
  useUserQuery(['topArtists'], (c) => c.getTopArtists(12), { offline: () => downloadedArtists().slice(0, 12) });
export const useRandomAlbums = () => useUserQuery(['randomAlbums'], (c) => c.getRandomAlbums(16));
export const useLikedSongs = () =>
  useUserQuery(['likedSongs'], async (c) => (await c.getFavoriteTracks()).Items, { offline: offlineLikedTracks });

export const useArtistAlbums = (id?: string) =>
  useUserQuery(['artistAlbums', id], async (c) => (await c.getArtistAlbums(id!)).Items, {
    enabled: !!id,
    offline: () => offlineArtistAlbums(id!),
  });
export const useAppearsOn = (id?: string) => useUserQuery(['appearsOn', id], (c) => c.getAppearsOn(id!), { enabled: !!id });
export const useTopTracks = (id?: string) =>
  useUserQuery(['topTracks', id], (c) => c.getTopTracks(id!, 10), {
    enabled: !!id,
    offline: () => offlineArtistTracks(id!).slice(0, 10),
  });
export const useSimilar = (id?: string) => useUserQuery(['similar', id], (c) => c.getSimilar(id!, 12), { enabled: !!id });

export const useGenreCounts = () =>
  useUserQuery(['genreCounts'], (c) => c.getGenreCounts(), { staleTime: 24 * 60 * 60_000 });
export const useGenreAlbums = (genre?: string) =>
  useUserQuery(['genreAlbums', genre], async (c) => (await c.getGenreAlbums(genre!)).Items, {
    enabled: !!genre,
    offline: () => offlineGenreAlbums(genre!),
  });
export const useGenreArtists = (genre?: string) =>
  useUserQuery(['genreArtists', genre], async (c) => (await c.getGenreArtists(genre!)).Items, { enabled: !!genre });
export const useGenreTopTracks = (genre?: string) =>
  useUserQuery(
    ['genreTopTracks', genre],
    async (c) => (await c.getGenreTracks(genre!, { mostPlayed: true, limit: 5 })).Items,
    { enabled: !!genre },
  );

export const usePlaylists = () =>
  useUserQuery(['playlists'], async (c) => (await c.getPlaylists()).Items, { offline: downloadedPlaylists });
export const usePlaylistItems = (id?: string) =>
  useUserQuery(['playlistItems', id], async (c) => (await c.getPlaylistItems(id!)).Items, {
    enabled: !!id,
    offline: () => offlinePlaylistTracks(id!),
  });
