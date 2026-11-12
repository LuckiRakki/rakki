// History and Stats queries (Rakki plugin 0.5), shared by the phone (src/app/stats.tsx) and the
// desktop (desktop/src/pages/Stats.tsx). Both give null when the server has no Rakki plugin 0.5.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { JellyfinClient } from '@/api/jellyfin';

/** Stats for the last `days` days (0 = all time). */
export function useRakkiStats(client: JellyfinClient | null, days: number) {
  return useQuery({
    queryKey: ['rakkiStats', client?.session.userId, days],
    enabled: !!client,
    staleTime: 60_000,
    queryFn: () => (client ? client.getRakkiStats(days) : Promise.resolve(null)),
  });
}

/** Every play, newest first, `page` at a time (the next page starts before the last one's time). */
export function useRakkiHistory(client: JellyfinClient | null, page: number) {
  return useInfiniteQuery({
    queryKey: ['rakkiHistory', client?.session.userId],
    enabled: !!client,
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => (client ? client.getRakkiHistory(page, pageParam) : Promise.resolve(null)),
    getNextPageParam: (last) => (last && last.length === page ? last[last.length - 1].At : undefined),
  });
}
