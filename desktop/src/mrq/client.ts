// Music Review Queue (MRQ): your tag editor on the server (a separate app, its own address).
// Edit Metadata (mrq/EditMetadata.tsx) changes a song's file tags through it, then has Jellyfin
// read the file again. Requests go through the app's native side (src-tauri mrq.rs), since MRQ
// doesn't answer pages from other sites. Set the address in Settings → Connections; without
// one, Edit Metadata doesn't show.
//
// Jellyfin and MRQ see the same music folder under different names (Jellyfin's
// "/music/Artist/Album/01.flac" is MRQ's "Artist/Album/01.flac"), so the first song finds how
// much of Jellyfin's path to drop by asking MRQ, and later songs reuse that.
import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { client } from '~/auth/session';
import { inTauri } from '~/lib/tauri';
import { kv } from '~/lib/kv';

const KEY = 'rakki.mrq';

/** "100.x.y.z:5000" or "http://host:5000/" → "http://host:5000". */
export function normalizeMrqUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

function load(): { url: string } {
  try {
    return { url: '', ...(JSON.parse(kv.getItem(KEY) ?? '{}') as { url?: string }) };
  } catch {
    return { url: '' };
  }
}

export const useMrq = create<{ url: string; setUrl(url: string): void }>((set) => ({
  ...load(),
  setUrl(url) {
    const next = normalizeMrqUrl(url);
    kv.setItem(KEY, JSON.stringify({ url: next }));
    prefix = null;
    paths.clear();
    set({ url: next });
  },
}));

/** Edit Metadata is offered: in the app, with an MRQ address. */
export const mrqReady = () => inTauri && !!useMrq.getState().url;

export class MrqError extends Error {}

async function call<T>(path: string, init: { method?: 'GET' | 'POST'; json?: unknown; body?: Uint8Array; contentType?: string } = {}, base = useMrq.getState().url): Promise<T> {
  if (!base) throw new MrqError('Add your MRQ address in Settings first.');
  const method = init.method ?? (init.json !== undefined || init.body ? 'POST' : 'GET');
  const body = init.body ?? new TextEncoder().encode(init.json === undefined ? '' : JSON.stringify(init.json));
  let raw: ArrayBuffer;
  try {
    raw = await invoke<ArrayBuffer>('mrq_request', body, {
      headers: { 'mrq-url': `${base}${path}`, 'mrq-method': method, 'content-type': init.contentType ?? 'application/json' },
    });
  } catch (e) {
    throw new MrqError(typeof e === 'string' ? e : e instanceof Error ? e.message : 'MRQ refused it.');
  }
  const text = new TextDecoder().decode(raw);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** MRQ's version (Settings → Test); throws when it can't be reached. */
export async function mrqVersion(url: string): Promise<string> {
  const r = await call<{ version?: string }>('/api/version', {}, normalizeMrqUrl(url));
  if (!r?.version) throw new MrqError('That address answered, but not as MRQ.');
  return r.version;
}

// ---- Jellyfin's path → MRQ's ----

/** The start of Jellyfin's paths that MRQ doesn't have ("/music/"), once found. */
let prefix: string | null = null;

const slashes = (p: string) => p.replace(/\\/g, '/');

async function inMrq(rel: string): Promise<boolean> {
  try {
    await call(`/api/tags/raw?src=L&p=${encodeURIComponent(rel)}`);
    return true;
  } catch {
    return false;
  }
}

/** MRQ's name for a song's file (relative to its library), or null when MRQ doesn't have it. */
async function mrqPath(jellyfinPath: string): Promise<string | null> {
  const path = slashes(jellyfinPath);
  if (prefix !== null && path.startsWith(prefix)) return path.slice(prefix.length);
  // Drop one folder at a time from the front until MRQ knows the rest (never just the file name).
  const parts = path.split('/');
  for (let i = 1; i < parts.length - 1; i++) {
    const rel = parts.slice(i).join('/');
    if (rel && (await inMrq(rel))) {
      prefix = `${parts.slice(0, i).join('/')}/`;
      return rel;
    }
  }
  return null;
}

/** The songs as Jellyfin has them now, with their files (an administrator's view). */
export async function withPaths(songs: BaseItem[]): Promise<BaseItem[]> {
  const c = client();
  if (!c) throw new MrqError('Not signed in.');
  const out: BaseItem[] = [];
  for (let i = 0; i < songs.length; i += 100) {
    const ids = songs.slice(i, i + 100).map((s) => s.Id);
    const r = await c.items({ Ids: ids.join(','), Fields: 'Path,Genres', IncludeItemTypes: 'Audio' });
    const byId = new Map(r.Items.map((x) => [x.Id, x]));
    for (const id of ids) {
      const it = byId.get(id);
      if (it) out.push(it);
    }
  }
  if (out.length && !out.some((s) => s.Path)) {
    throw new MrqError('Jellyfin only shares where files are with an administrator. Sign in as one to edit metadata.');
  }
  return out;
}

// ---- Spotify links ----

/** The 22-character Spotify id in a track (or album) link, URI or bare id; '' when there isn't one. */
export function spotifyId(value: string, kind: 'track' | 'album' = 'track'): string {
  const v = value.trim();
  const m = new RegExp(`${kind}[/:]([A-Za-z0-9]{22})`).exec(v) ?? /^([A-Za-z0-9]{22})$/.exec(v);
  return m ? m[1] : '';
}

export const spotifyLink = (id: string, kind: 'track' | 'album' = 'track') => (id ? `https://open.spotify.com/${kind}/${id}` : '');

/**
 * The Spotify id among a file's tags as MRQ lists them ([name, value] pairs). The tag's name
 * differs by format: TXXX:SPOTIFY_TRACK_ID (MP3), SPOTIFY_TRACK_ID (FLAC, Ogg), ----:...:SPOTIFY_TRACK_ID (M4A).
 */
export function spotifyTag(tags: unknown): string {
  const pairs: [string, unknown][] = Array.isArray(tags)
    ? tags.filter((t): t is [string, unknown] => Array.isArray(t) && typeof t[0] === 'string')
    : tags && typeof tags === 'object'
      ? Object.entries(tags)
      : [];
  for (const [name, value] of pairs) {
    if (!/spotify/i.test(name)) continue;
    // One id, a link, or several values joined with " \\ ": the first id wins.
    const text = String(Array.isArray(value) ? value[0] : value);
    const id = spotifyId(text) || (/(?:^|[^A-Za-z0-9])([A-Za-z0-9]{22})(?![A-Za-z0-9])/.exec(text)?.[1] ?? '');
    if (id) return id;
  }
  return '';
}

/** MRQ's name for each song's file, found once per song (Edit Metadata asks, then saves). */
const paths = new Map<string, string>();

async function pathOf(song: BaseItem): Promise<string | null> {
  const known = paths.get(song.Id);
  if (known) return known;
  const p = song.Path ? await mrqPath(song.Path) : null;
  if (p) paths.set(song.Id, p);
  return p;
}

/**
 * The Spotify link each song's file has now (MRQ keeps it in the tags, where Spicy Lyrics finds
 * the song). Songs without one, or MRQ can't find, are left out.
 */
export async function spotifyIdsOf(songs: BaseItem[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    songs.map(async (song) => {
      const p = await pathOf(song);
      if (!p) return;
      try {
        const r = await call<{ tags?: unknown }>(`/api/tags/raw?src=L&p=${encodeURIComponent(p)}`);
        const id = spotifyTag(r.tags);
        if (id) out.set(song.Id, id);
      } catch {
        // No link shown; saving still works.
      }
    }),
  );
  return out;
}

export interface SpotifyAlbum {
  name: string;
  tracks: { id: string; title: string; artists: string; ms: number }[];
}

/** A Spotify album's songs in order (src-tauri mrq.rs reads its public page). */
export async function spotifyAlbum(link: string): Promise<SpotifyAlbum> {
  const id = spotifyId(link, 'album');
  if (!id) throw new MrqError('Paste a Spotify album link (open.spotify.com/album/...).');
  try {
    return await invoke<SpotifyAlbum>('spotify_album', { id });
  } catch (e) {
    throw new MrqError(typeof e === 'string' ? e : 'Spotify didn’t answer.');
  }
}

const plain = (t: string) =>
  t
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Which Spotify song is which of yours: same title first; otherwise the same place in the
 * album when both have the same number of songs, or the length agrees within 3 seconds.
 * Songs (in album order) → Spotify ids; unmatched songs are left out.
 */
export function matchAlbum(songs: BaseItem[], album: SpotifyAlbum): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<number>();
  const byTitle = new Map<string, number[]>();
  album.tracks.forEach((t, i) => byTitle.set(plain(t.title), [...(byTitle.get(plain(t.title)) ?? []), i]));
  songs.forEach((s) => {
    const i = (byTitle.get(plain(s.Name ?? '')) ?? []).find((x) => !used.has(x));
    if (i === undefined) return;
    used.add(i);
    out.set(s.Id, album.tracks[i].id);
  });
  const same = songs.length === album.tracks.length;
  songs.forEach((s, at) => {
    if (out.has(s.Id) || used.has(at) || !album.tracks[at]) return;
    const ms = (s.RunTimeTicks ?? 0) / 10_000;
    if (same || (ms && Math.abs(ms - album.tracks[at].ms) < 3000)) {
      used.add(at);
      out.set(s.Id, album.tracks[at].id);
    }
  });
  return out;
}

// ---- Saving ----

/** What MRQ writes: only the fields that changed. Artists and genres are lists. */
export interface TagChanges {
  title?: string;
  artist?: string[];
  albumartist?: string[];
  album?: string;
  date?: string;
  genre?: string[];
  tracknumber?: string;
  discnumber?: string;
  composer?: string;
  /** The song's Spotify id ('' removes it); MRQ also writes the .spotify file Spicy Lyrics reads. */
  spotifyid?: string;
}

interface Job {
  state: string;
  error?: string;
  done?: number;
  total?: number;
  errors?: { p: string; error: string }[];
  result?: { changed?: number };
}

async function finish(jobId: string): Promise<Job> {
  for (let wait = 250; ; wait = Math.min(wait * 1.5, 2000)) {
    const job = await call<Job>(`/api/jobs/${jobId}`);
    if (job.error && !job.result) throw new MrqError(job.error);
    if (job.state !== 'running' && job.state !== 'queued') return job;
    await new Promise((r) => setTimeout(r, wait));
  }
}

export interface SaveResult {
  /** Songs whose file changed. */
  changed: string[];
  /** Songs MRQ couldn't find or write, with why. */
  failed: { song: BaseItem; why: string }[];
}

const isEmpty = (c?: TagChanges) => !c || Object.keys(c).length === 0;

/**
 * Write the changes to the songs' files through MRQ: `changes` for every song, `each` per song
 * (an album's titles, numbers and Spotify links), and the cover if one was picked. Then have
 * Jellyfin read those files again.
 */
export async function saveTags(songs: BaseItem[], changes: TagChanges, cover?: File, each: Map<string, TagChanges> = new Map()): Promise<SaveResult> {
  const failed: SaveResult['failed'] = [];
  const found: { song: BaseItem; p: string }[] = [];
  for (const song of songs) {
    const p = await pathOf(song);
    if (p) found.push({ song, p });
    else failed.push({ song, why: song.Path ? 'MRQ doesn’t have this file' : 'Jellyfin didn’t say where the file is' });
  }
  if (!found.length) return { changed: [], failed };
  const bySong = new Map(found.map((f) => [f.p, f.song]));
  const changed = new Set<string>();
  const note = (job: Job, which: { song: BaseItem; p: string }[]) => {
    const bad = new Set<string>();
    for (const e of job.errors ?? []) {
      const song = bySong.get(e.p);
      if (song && !bad.has(e.p)) failed.push({ song, why: e.error });
      bad.add(e.p);
    }
    for (const f of which) if (!bad.has(f.p)) changed.add(f.song.Id);
  };

  const tagged = isEmpty(changes) ? found.filter((f) => !isEmpty(each.get(f.song.Id))) : found;
  if (tagged.length) {
    const desc = `Rakki: edited ${tagged.length === 1 ? (tagged[0].song.Name ?? 'a song') : `${tagged.length} songs`}`;
    const items = tagged.map((f) => ({ p: f.p, set: each.get(f.song.Id) ?? {} }));
    const r = await call<{ job: string }>('/api/tags/batch', { json: { src: 'L', items, set: changes, desc } });
    note(await finish(r.job), tagged);
  }
  if (cover) {
    const boundary = `----rakki${Math.random().toString(36).slice(2)}`;
    const payload = JSON.stringify({ src: 'L', paths: found.map((f) => f.p) });
    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${payload}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="cover"\r\nContent-Type: ${cover.type || 'image/jpeg'}\r\n\r\n`,
    );
    const image = new Uint8Array(await cover.arrayBuffer());
    const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    const body = new Uint8Array(head.length + image.length + tail.length);
    body.set(head, 0);
    body.set(image, head.length);
    body.set(tail, head.length + image.length);
    const r = await call<{ job: string }>('/api/tags/art', { body, contentType: `multipart/form-data; boundary=${boundary}` });
    note(await finish(r.job), found);
  }

  // Jellyfin reads the changed files again (queued on the server; a moment later it has them).
  const c = client();
  if (c) await Promise.allSettled([...changed].map((id) => c.refreshItem(id)));
  return { changed: [...changed], failed };
}
