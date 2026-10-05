// Search by lyrics: songs whose lyrics contain what was typed, like Spotify. The Spicy Lyrics
// plugin keeps the index on the server (every song's lyrics, rebuilt nightly), so the phone
// only asks. Servers with an older plugin answer 404 and the section simply doesn't show.
import { useQuery } from '@tanstack/react-query';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { useOffline } from '@/lib/online';

export interface LyricsMatch {
  track: BaseItem;
  /** The line that matched, as written. */
  line: string;
}

/** Worth asking about: two words or more (single words match far too many songs). */
const looksLikeLyrics = (term: string) => term.trim().split(/\s+/).filter((w) => w.length > 1).length >= 2;

export function useLyricsSearch(term: string) {
  const client = useAuth((s) => s.client);
  const offline = useOffline();
  const text = term.trim();
  return useQuery({
    queryKey: ['lyricsSearch', client?.session.userId, text.toLowerCase()],
    enabled: !!client && !offline && looksLikeLyrics(text),
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<LyricsMatch[]> => {
      let found: { Ready: boolean; Items: { ItemId: string; Line: string }[] };
      try {
        found = await client!.searchLyrics(text, 12);
      } catch {
        return []; // no plugin (or an older one) on this server
      }
      if (!found.Items.length) return [];
      const tracks = await client!.getItemsByIds(found.Items.map((h) => h.ItemId));
      const byId = new Map(tracks.map((t) => [t.Id, t]));
      return found.Items.flatMap((h) => {
        const track = byId.get(h.ItemId);
        return track ? [{ track, line: h.Line }] : [];
      });
    },
  });
}
