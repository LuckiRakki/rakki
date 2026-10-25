// Which lyrics a song shows when it has more than one kind (Lyrics Settings, phone and desktop).
// The Spicy Lyrics API sometimes has word-by-word lyrics while the song's own .ttml file is
// better, so the person picks. The pick is kept by the Rakki plugin (0.4, server/src/SpicyLyrics/
// LyricsSources.cs) for the song, so every Rakki shows the same lyrics, and the plugin answers
// /SpicyLyrics/{id}/ttml with the picked ones (marked `chosen`, which pickLyrics puts first).
// Picking Jellyfin makes that answer empty, so Jellyfin's own lyrics show.
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { JellyfinError } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { saveLyrics } from '@/downloads/manager';
import { useDownloads } from '@/downloads/store';
import { useLyrics } from '@/lyrics/fetch';

export type LyricsSource = 'auto' | 'made' | 'spicy' | 'local' | 'jellyfin';

export interface LyricsSourceOption {
  source: LyricsSource;
  label: string;
  /** Word by word, line by line, or not synced (unknown for Automatic: it's whichever wins). */
  kind: 'word' | 'line' | 'plain' | null;
  lines: number;
}

export interface LyricsSources {
  /** The server's Rakki plugin keeps picks (0.4 or later). */
  supported: boolean;
  choice: LyricsSource;
  /** Automatic first, then every kind the song has. Only Automatic: nothing to pick. */
  options: LyricsSourceOption[];
}

export const LYRICS_SOURCE_LABELS: Record<LyricsSource, string> = {
  auto: 'Automatic',
  made: 'Made in Rakki',
  spicy: 'Spicy Lyrics',
  local: 'Lyrics File',
  jellyfin: 'Jellyfin',
};

const ORDER: LyricsSource[] = ['made', 'spicy', 'local', 'jellyfin'];
const isSource = (s: string): s is LyricsSource => s === 'auto' || (ORDER as string[]).includes(s);
const asKind = (k: string): LyricsSourceOption['kind'] => (k === 'word' || k === 'line' || k === 'plain' ? k : null);

interface ServerSources {
  supported: boolean;
  choice: LyricsSource;
  options: LyricsSourceOption[];
}

const sourcesKey = (userId: string | undefined, itemId: string | undefined) => ['lyrics-sources', userId, itemId];

/** The song's pick and the kinds of lyrics it has (Jellyfin's from the lyrics already loaded). */
export function useLyricsSources(itemId: string | undefined): { data: LyricsSources | undefined; isLoading: boolean } {
  const client = useAuth((s) => s.client);
  const lyrics = useLyrics(itemId);
  const q = useQuery({
    queryKey: sourcesKey(client?.session.userId, itemId),
    enabled: !!client && !!itemId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ServerSources> => {
      // Not `client!.x` in here (React Compiler reads closures while rendering, AGENTS.md).
      if (!client || !itemId) return { supported: false, choice: 'auto', options: [] };
      try {
        const r = await client.getLyricsSources(itemId);
        return {
          supported: true,
          choice: isSource(r.Choice) ? r.Choice : 'auto',
          options: r.Options.filter((o) => isSource(o.Source)).map((o) => ({
            source: o.Source as LyricsSource,
            label: LYRICS_SOURCE_LABELS[o.Source as LyricsSource],
            kind: asKind(o.Kind),
            lines: o.Lines,
          })),
        };
      } catch (e) {
        // No plugin, or one older than 0.4.
        if (e instanceof JellyfinError && e.status === 404) return { supported: false, choice: 'auto', options: [] };
        throw e;
      }
    },
  });
  if (!q.data) return { data: undefined, isLoading: q.isLoading };
  const lrc = lyrics.data?.lrc;
  const options: LyricsSourceOption[] = [{ source: 'auto', label: LYRICS_SOURCE_LABELS.auto, kind: null, lines: 0 }, ...q.data.options];
  if (lrc?.lines.length) options.push({ source: 'jellyfin', label: LYRICS_SOURCE_LABELS.jellyfin, kind: lrc.isSynced ? 'line' : 'plain', lines: lrc.lines.length });
  options.sort((a, b) => (a.source === 'auto' ? -1 : b.source === 'auto' ? 1 : ORDER.indexOf(a.source) - ORDER.indexOf(b.source)));
  return { data: { supported: q.data.supported, choice: q.data.choice, options }, isLoading: false };
}

/**
 * Pick the song's lyrics for everyone ('auto' goes back to automatic). Shown at once; the lyrics
 * load again. A downloaded song's saved lyrics are saved again too. Throws when the server
 * refused (the pick goes back), for a "Couldn't..." toast.
 */
export async function setLyricsSource(queryClient: QueryClient, itemId: string, source: LyricsSource): Promise<void> {
  const client = useAuth.getState().client;
  if (!client) throw new Error("You're not signed in.");
  const key = sourcesKey(client.session.userId, itemId);
  const before = queryClient.getQueryData<ServerSources>(key);
  if (before) queryClient.setQueryData<ServerSources>(key, { ...before, choice: source });
  try {
    await client.setLyricsSource(itemId, source);
  } catch (e) {
    if (before) queryClient.setQueryData(key, before);
    throw e;
  }
  if (useDownloads.getState().tracks[itemId]?.lyrics) await saveLyrics(client, itemId).catch(() => false);
  await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'lyrics' && q.queryKey[2] === itemId });
}
