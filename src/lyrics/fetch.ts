import { useQuery } from '@tanstack/react-query';

import type { JellyfinClient } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { downloadsSupported, lyricsFile } from '@/downloads/files';
import { useDownloads } from '@/downloads/store';
import type { JellyfinLyricsDto, Lyrics, LyricsBundle, TtmlDto } from '@/lyrics/types';

const TICKS_PER_MS = 10_000;

function person(p?: { Username: string; Url: string; Avatar?: string } | null) {
  return p?.Username ? { username: p.Username, url: p.Url ?? '', avatar: p.Avatar || undefined } : undefined;
}

/** Word-level lyrics from the Spicy Lyrics plugin, or null. */
export async function fetchTtml(client: JellyfinClient, itemId: string): Promise<Lyrics | null> {
  let dto: TtmlDto | undefined;
  try {
    dto = await client.getSpicyLyrics(itemId);
  } catch {
    return null; // 404 = no TTML for this song; plugin missing = 404 too
  }
  if (!dto?.Lines?.length) return null;
  const hasWordCues = dto.Lines.some((l) => (l.Words?.length ?? 0) > 0);
  const cue = (w: { Text: string; StartMs: number; EndMs: number }) => ({
    text: w.Text,
    startMs: w.StartMs,
    endMs: w.EndMs,
  });
  const lines = dto.Lines.map((l) => ({
    text: l.Text,
    startMs: l.StartMs,
    endMs: l.EndMs,
    words: l.Words?.map(cue),
    bgWords: l.BgWords?.map(cue),
    agent: l.Agent || undefined,
  }));
  // Apple TTML with itunes:timing="None" has every line at 00:00 but still reports
  // IsSynced=true; without this guard the animator jumps straight to the last line.
  const hasRealTiming = hasWordCues || lines.some((l) => l.startMs > 0 || l.endMs > 0);
  return {
    kind: 'ttml',
    isSynced: dto.IsSynced && hasRealTiming,
    hasWordCues,
    lines,
    songwriters: dto.Songwriters?.length ? dto.Songwriters : undefined,
    source: dto.Source || undefined,
    attribution: dto.Attribution
      ? { uploader: person(dto.Attribution.Uploader), maker: person(dto.Attribution.Maker) }
      : undefined,
  };
}

/** Line-level (LRC) or plain lyrics from Jellyfin itself, or null. */
export async function fetchLrc(client: JellyfinClient, itemId: string): Promise<Lyrics | null> {
  let dto: JellyfinLyricsDto | undefined;
  try {
    dto = await client.getLyrics(itemId);
  } catch {
    return null;
  }
  const raw = dto?.Lyrics;
  if (!raw?.length) return null;
  const lines = raw.map((l, i) => {
    const startMs = l.Start ? Math.round(l.Start / TICKS_PER_MS) : 0;
    const next = raw[i + 1]?.Start;
    return {
      text: l.Text ?? '',
      startMs,
      endMs: next ? Math.round(next / TICKS_PER_MS) : startMs + 5000,
    };
  });
  return {
    kind: 'lrc',
    isSynced: dto?.Metadata?.IsSynced ?? lines.some((l) => l.startMs > 0),
    hasWordCues: false,
    lines,
  };
}

/** Both sources for a song, fetched in parallel and cached. */
async function savedLyrics(itemId: string): Promise<LyricsBundle | null> {
  if (!downloadsSupported || !useDownloads.getState().tracks[itemId]?.lyrics) return null;
  try {
    return (await lyricsFile(itemId).json()) as LyricsBundle;
  } catch {
    return null;
  }
}

export function useLyrics(itemId: string | undefined) {
  const client = useAuth((s) => s.client);
  return useQuery({
    queryKey: ['lyrics', client?.session.userId, itemId],
    enabled: !!client && !!itemId,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<LyricsBundle> => {
      // Downloaded songs use the lyrics saved with them (works offline, no request).
      const saved = await savedLyrics(itemId!);
      if (saved) return saved;
      const [ttml, lrc] = await Promise.all([fetchTtml(client!, itemId!), fetchLrc(client!, itemId!)]);
      return { ttml, lrc };
    },
  });
}

/** One line of the credits at the end of the lyrics. */
export interface CreditRow {
  text: string;
  /** Opens on tap (a Spicy Lyrics profile, or the Spicy Lyrics site). */
  link?: string;
  /** A round profile picture before the text. */
  avatar?: string;
}

function providerName(source?: string): string | null {
  return source === 'spicy_lyrics'
    ? 'Spicy Lyrics'
    : source === 'apple_music'
      ? 'Apple Music'
      : source === 'spotify'
        ? 'Spotify'
        : null;
}

/**
 * The credits after the last line: who wrote the song, then who provided the lyrics (required
 * by the Spicy Lyrics API Terms), with the people who synced and uploaded them.
 */
export function creditRows(l: Lyrics): CreditRow[] {
  const rows: CreditRow[] = [];
  if (l.songwriters?.length) rows.push({ text: `Written by: ${l.songwriters.join(', ')}` });
  const provider = providerName(l.source);
  if (provider) {
    rows.push({ text: `Lyrics provided by ${provider}`, link: l.source === 'spicy_lyrics' ? 'https://spicylyrics.org' : undefined });
  }
  const { maker, uploader } = l.attribution ?? {};
  if (maker) rows.push({ text: `Synced by ${maker.username}`, link: maker.url || undefined, avatar: maker.avatar });
  if (uploader && uploader.username !== maker?.username) {
    rows.push({ text: `Uploaded by ${uploader.username}`, link: uploader.url || undefined, avatar: uploader.avatar });
  }
  return rows;
}

/** The credit line shown under the lyrics (required by the Spicy Lyrics API Terms). */
export function creditLine(l: Lyrics): string | null {
  const provider =
    l.source === 'spicy_lyrics'
      ? 'Spicy Lyrics'
      : l.source === 'apple_music'
        ? 'Apple Music'
        : l.source === 'spotify'
          ? 'Spotify'
          : null;
  if (!provider) return null;
  const who = [
    l.attribution?.maker ? `synced by ${l.attribution.maker.username}` : null,
    l.attribution?.uploader ? `uploaded by ${l.attribution.uploader.username}` : null,
  ].filter(Boolean);
  return `Lyrics provided by ${provider}${who.length ? ` · ${who.join(' · ')}` : ''}`;
}
