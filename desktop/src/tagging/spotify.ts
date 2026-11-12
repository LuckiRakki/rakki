// Spotify links from one album (or playlist) link: every song gets the link of the Spotify song
// it matches. Spicy Lyrics finds a song's word-synced lyrics by that link. The album's songs come
// from Spotify's public page through the app (src-tauri mrq.rs, no account needed); a playlist,
// or Rakki in a plain browser tab, asks MRQ (which asks Downtify).
import { spotifyAlbum, spotifyId } from '~/mrq/client';
import { inTauri } from '~/lib/tauri';
import { spotifyTracks, MrqError } from '~/tagging/api';

export interface SpotifySong {
  id: string;
  title: string;
  artists: string;
  /** Length in seconds. */
  length: number;
  n: number;
}

export async function spotifyList(link: string): Promise<{ name: string; tracks: SpotifySong[] }> {
  const album = spotifyId(link, 'album');
  const playlist = spotifyId(link, 'playlist');
  if (!album && !playlist) throw new MrqError('Paste a Spotify album or playlist link (open.spotify.com/album/…).');
  if (album && inTauri) {
    const a = await spotifyAlbum(link);
    return { name: a.name, tracks: a.tracks.map((t, i) => ({ id: t.id, title: t.title, artists: t.artists, length: t.ms / 1000, n: i + 1 })) };
  }
  const r = await spotifyTracks(link.trim());
  return { name: r.name, tracks: r.tracks.map((t, i) => ({ id: t.id, title: t.title, artists: t.artists.join(', '), length: t.length, n: t.n || i + 1 })) };
}

/** A title without its feat. credit, version note or punctuation, for comparing. */
export const plainTitle = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

export interface Pairing {
  key: string;
  /** Index in the Spotify list, or -1 for none. */
  at: number;
  /** 100 = same title; lower = matched by place or length only. */
  score: number;
}

/**
 * Which Spotify song is which of yours: the same title first (track number, then length, break
 * ties); then, for the rest, the same place in the album when both have as many songs, or a length
 * within 3 seconds at that place. A Spotify song goes to one of yours at most.
 */
export function pairSongs(mine: { key: string; title: string; n: number; length: number }[], theirs: SpotifySong[], sameAlbum = true): Pairing[] {
  const used = new Set<number>();
  const out = new Map<string, Pairing>();
  const byTitle = new Map<string, number[]>();
  theirs.forEach((t, i) => byTitle.set(plainTitle(t.title), [...(byTitle.get(plainTitle(t.title)) ?? []), i]));
  for (const m of mine) {
    const cands = (byTitle.get(plainTitle(m.title)) ?? []).filter((i) => !used.has(i));
    if (!cands.length) continue;
    cands.sort((a, b) => (theirs[a].n === m.n ? -1 : 0) - (theirs[b].n === m.n ? -1 : 0) || Math.abs(theirs[a].length - m.length) - Math.abs(theirs[b].length - m.length));
    used.add(cands[0]);
    out.set(m.key, { key: m.key, at: cands[0], score: 100 });
  }
  if (sameAlbum) {
    const same = mine.length === theirs.length;
    for (const m of mine) {
      if (out.has(m.key)) continue;
      const at = m.n ? m.n - 1 : -1;
      if (at < 0 || used.has(at) || !theirs[at]) continue;
      const close = m.length && Math.abs(theirs[at].length - m.length) < 3;
      if (same || close) {
        used.add(at);
        out.set(m.key, { key: m.key, at, score: close ? 70 : 50 });
      }
    }
  }
  return mine.map((m) => out.get(m.key) ?? { key: m.key, at: -1, score: 0 });
}
