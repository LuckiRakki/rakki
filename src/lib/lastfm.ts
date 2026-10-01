// Worldwide play counts from Last.fm, for an artist's Popular songs. Uses the user's own free
// API key (Settings → Last.fm), which stays on the phone. Answers are kept for a week, since
// the counts change slowly.
import type { BaseItem } from '@/api/jellyfin';
import { readPref, writePref } from '@/lib/prefs';
import { useSettings } from '@/settings/store';

const API = 'https://ws.audioscrobbler.com/2.0/';
const KEEP_MS = 7 * 24 * 60 * 60_000;
const TIMEOUT_MS = 10_000;

export interface LastfmTrack {
  name: string;
  /** Scrobbles, worldwide. */
  playcount: number;
  listeners: number;
}

export interface PopularTrack {
  track: BaseItem;
  playcount: number;
}

export class LastfmError extends Error {}

async function call(params: Record<string, string>, key: string): Promise<unknown> {
  const query = new URLSearchParams({ ...params, api_key: key, format: 'json' }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}?${query}`, { signal: controller.signal });
    const json = (await res.json()) as { error?: number; message?: string };
    if (json.error) throw new LastfmError(json.message ?? `Last.fm error ${json.error}`);
    return json;
  } catch (e) {
    if (e instanceof LastfmError) throw e;
    throw new LastfmError("Couldn't reach Last.fm.");
  } finally {
    clearTimeout(timer);
  }
}

/** Whether a key works (Settings → Last.fm → Check). */
export async function checkLastfmKey(key: string): Promise<void> {
  await call({ method: 'artist.gettoptracks', artist: 'Radiohead', limit: '1' }, key.trim());
}

/** The artist's most played tracks on Last.fm, most played first (up to 100). */
export async function artistTopTracks(artist: string): Promise<LastfmTrack[]> {
  const key = useSettings.getState().lastfmApiKey.trim();
  if (!key) throw new LastfmError('No Last.fm API key.');
  const cacheKey = `rakki.lastfm.top.${artist.toLowerCase()}`;
  try {
    const kept = JSON.parse(readPref(cacheKey) ?? 'null') as { at: number; tracks: LastfmTrack[] } | null;
    if (kept && Date.now() - kept.at < KEEP_MS) return kept.tracks;
  } catch {
    // Fetch again.
  }
  const json = (await call({ method: 'artist.gettoptracks', artist, autocorrect: '1', limit: '100' }, key)) as {
    toptracks?: { track?: { name: string; playcount: string; listeners: string }[] };
  };
  const tracks = (json.toptracks?.track ?? []).map((t) => ({
    name: t.name,
    playcount: Number(t.playcount) || 0,
    listeners: Number(t.listeners) || 0,
  }));
  writePref(cacheKey, JSON.stringify({ at: Date.now(), tracks }));
  return tracks;
}

/**
 * A title reduced for matching: case, accents, punctuation, "&"/"and", and featuring credits
 * or edition notes ("(feat. X)", "- 2011 Remaster") don't count.
 */
export function matchKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[([](?:feat|ft|with|featuring)\b[^)\]]*[)\]]/g, '')
    .replace(/[([][^)\]]*\b(?:remaster(?:ed)?|version|mono|stereo|deluxe|bonus|explicit|clean)\b[^)\]]*[)\]]/g, '')
    .replace(/\s-\s.*\b(?:remaster(?:ed)?|version|mono|stereo|edit)\b.*$/, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The library's songs in Last.fm's order, each with its worldwide play count. Songs Last.fm
 * lists that aren't in the library are left out (they couldn't play). When the library has a
 * song more than once, the one on the artist's own album wins, then the one played most.
 */
export function matchPopular(top: LastfmTrack[], library: BaseItem[], artistId: string): PopularTrack[] {
  const byKey = new Map<string, BaseItem[]>();
  for (const track of library) {
    const key = matchKey(track.Name);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), track]);
  }
  const own = (t: BaseItem) => (t.AlbumArtists?.some((a) => a.Id === artistId) ? 1 : 0);
  const used = new Set<string>();
  const out: PopularTrack[] = [];
  for (const entry of top) {
    const candidates = (byKey.get(matchKey(entry.name)) ?? []).filter((t) => !used.has(t.Id));
    if (!candidates.length) continue;
    const best = [...candidates].sort(
      (a, b) => own(b) - own(a) || (b.UserData?.PlayCount ?? 0) - (a.UserData?.PlayCount ?? 0),
    )[0];
    // One entry per song, even when Last.fm lists it twice under slightly different titles.
    for (const c of candidates) used.add(c.Id);
    out.push({ track: best, playcount: entry.playcount });
  }
  return out;
}

/** "1,234,567". */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
