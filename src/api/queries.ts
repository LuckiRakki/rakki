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
