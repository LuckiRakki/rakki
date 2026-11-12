// Everything Tagging asks MRQ (Music Review Queue, the tag editor on your server), typed. MRQ's own
// API is described in its docs/API.md; requests go through mrq/client.ts `call` (the app's native
// side). Pictures, songs and videos load straight from MRQ's address in <img>, <audio> and <video>,
// which need no permission from MRQ.
//
// Words: the "inbox" is MRQ's review queue (new downloads waiting to be tagged and sent), the
// "library" is your music folder (MRQ edits those files in place). A queue song is named by a
// `tid` (its path, base64); a library song by its path `p` (or a tid of "L/" + p).
import { create } from 'zustand';

import { call, MrqError, useMrq } from '~/mrq/client';

export { MrqError };

// ---- Addresses for pictures, sound and video ----

const base = () => useMrq.getState().url;

/** base64url of the UTF-8 bytes, as MRQ names songs (padding kept, like Python's). */
export function tidOf(path: string): string {
  const bytes = new TextEncoder().encode(path);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_');
}

export const libraryTid = (p: string) => tidOf(`L/${p}`);

/** A song's cover: s = 64, 160 or 320 for a small copy; v (its change time) keeps it fresh. */
export const artUrl = (tid: string, v?: number, s?: 64 | 160 | 320) => `${base()}/api/art/${tid}?v=${v ?? 0}${s ? `&s=${s}` : ''}`;
export const audioUrl = (tid: string) => `${base()}/api/audio/${tid}`;
export const videoUrl = (src: Src, p: string) => `${base()}/api/video/file?src=${src}&p=${encodeURIComponent(p)}`;
export const posterUrl = (src: Src, p: string, v?: number, s?: 64 | 160 | 320) =>
  `${base()}/api/video/poster?src=${src}&p=${encodeURIComponent(p)}&v=${v ?? 0}${s ? `&s=${s}` : ''}`;
export const folderImageUrl = (tid: string, name: string) => `${base()}/api/folder-image/${tid}?name=${encodeURIComponent(name)}`;

const q = (params: Record<string, string | number | boolean | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

/** A form with a JSON `payload` and an `image` file (MRQ's covers and posters). */
async function multipart(payload: unknown, image: Blob): Promise<{ body: Uint8Array; contentType: string }> {
  const boundary = `----rakki${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify(payload)}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="cover"\r\nContent-Type: ${image.type || 'image/jpeg'}\r\n\r\n`,
  );
  const data = new Uint8Array(await image.arrayBuffer());
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + data.length + tail.length);
  body.set(head, 0);
  body.set(data, head.length);
  body.set(tail, head.length + data.length);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Values joined the way MRQ reads one text field with several in it. */
export const SEP = ' \\\\ ';
export const joinValues = (v: string[]) => v.filter(Boolean).join(SEP);
/** "A \\ B" (or A; B, A | B) → [A, B]. Genres also split on commas. */
export function splitValues(v: string | string[] | undefined, genre = false): string[] {
  if (Array.isArray(v)) return v.map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of (v ?? '').split(genre ? /\s*(?:\\+|;|\||,)\s*|[\r\n]+/ : /\s*(?:\\+|;|\|)\s*|[\r\n]+/)) {
    const x = part.replace(/\s+/g, ' ').trim();
    if (!x || seen.has(x.toLowerCase())) continue;
    seen.add(x.toLowerCase());
    out.push(x);
  }
  return out;
}

export const RELEASE_TYPES = ['Single', 'EP', 'Album', 'Compilation', 'Collection', 'Mixtape', 'Live', 'Demo'];

// ---- Jobs: long edits run on the server; the page follows them ----

export interface Job<R = unknown> {
  id: string;
  kind?: string;
  desc?: string;
  state: 'running' | 'done' | 'error' | string;
  done: number;
  total: number;
  current?: string;
  errors: { p: string; error: string }[];
  result: R | null;
}

/** The jobs running now, for the progress line at the top of Tagging. */
export const useJobs = create<{ jobs: Record<string, { desc: string; done: number; total: number }> }>(() => ({ jobs: {} }));

/** Follow a job to its end (progress shows at the top of Tagging). Throws when it failed outright. */
export async function runJob<R>(started: Promise<{ job: string }> | { job: string }, desc: string): Promise<Job<R>> {
  const { job: id } = await started;
  const show = (done: number, total: number) => useJobs.setState((s) => ({ jobs: { ...s.jobs, [id]: { desc, done, total } } }));
  show(0, 0);
  try {
    for (let wait = 200; ; wait = Math.min(wait * 1.4, 1500)) {
      const job = await call<Job<R>>(`/api/jobs/${id}`);
      show(job.done, job.total);
      if (job.state !== 'running' && job.state !== 'queued') {
        if (job.state === 'error' && !job.result) throw new MrqError(job.errors[0]?.error || 'MRQ couldn’t finish it.');
        return job;
      }
      await new Promise((r) => setTimeout(r, wait));
    }
  } finally {
    useJobs.setState((s) => {
      const jobs = { ...s.jobs };
      delete jobs[id];
      return { jobs };
    });
  }
}

export const cancelJob = (id: string) => call(`/api/jobs/${id}/cancel`, { method: 'POST', json: {} });

// ---- The review queue (inbox) ----

export interface Group {
  id: string;
  artist: string;
  count: number;
  compilation: boolean;
  /** The artist is in the library already (else a new artist folder is made). */
  known: boolean;
  thumb: string;
  v: number;
}

export interface QueueTrack {
  id: string;
  title: string;
  artist: string;
  albumartist: string;
  album: string;
  date: string;
  genre: string;
  tracknumber: string;
  discnumber: string;
  composer: string;
  releasetype: string;
  spotifyid: string;
  length: number;
  file: string;
  ext: string;
  art: boolean;
  aw: number;
  ah: number;
  ab: number;
  mt: number;
}

export interface LibraryAlbum {
  rel: string;
  folder: string;
  artist_folder: string;
  album: string;
  albumartist: string;
  date: string;
  releasetype: string;
  genre: string;
  tracks: number;
  discs: number[];
  formats: string[];
  cover: string;
  mt: number;
}

export interface GroupDetail {
  id: string;
  artist: string;
  /** The library's spelling of the artist, when they're in it already. */
  artist_match: string | null;
  existing_genres: string[];
  tracks: QueueTrack[];
  library_albums?: LibraryAlbum[];
  compilation?: boolean;
  comp_album?: string;
}

export const getGroups = () => call<Group[]>('/api/groups');
export const getGroup = (gid: string) => call<GroupDetail>(`/api/group/${gid}`);

/** What a send writes (any of these; artists and genres as "A \\ B"). */
export interface SendData {
  title?: string;
  artist?: string;
  albumartist?: string;
  album?: string;
  date?: string;
  genre?: string;
  tracknumber?: string;
  discnumber?: string;
  composer?: string;
  releasetype?: string;
  spotifyid?: string;
  favorite?: boolean;
}

export interface Warning {
  level: 'warn' | 'error' | 'info' | string;
  kind: string;
  msg: string;
  detail?: string;
  id?: string;
}

export const validate = (gid: string, ids: string[], data: SendData) => call<{ warnings: Warning[] }>(`/api/validate/${gid}`, { json: { ids, data } });
export const confirmTrack = (tid: string, data: SendData) => call<{ ok: boolean; dest: string }>(`/api/confirm/${tid}`, { json: data });
export const saveTrack = (tid: string, data: SendData) => call<{ ok: boolean; track: QueueTrack }>(`/api/track/${tid}`, { json: data });
export const rejectTrack = (tid: string) => call<{ ok: boolean }>(`/api/reject/${tid}`, { json: {} });

export type ArtChoice = { url: string } | { from: string } | { file: Blob } | null;

export async function sendAlbum(tracks: { id: string; data: SendData }[], art: ArtChoice) {
  type R = { ok: boolean; results: { id: string; ok: boolean; dest?: string; error?: string }[] };
  if (art && 'file' in art) {
    const m = await multipart({ tracks, art: null }, art.file);
    return call<R>('/api/send-album', { body: m.body, contentType: m.contentType });
  }
  return call<R>('/api/send-album', { json: { tracks, art } });
}

export const libraryAlbums = (p: { artist?: string; q?: string; limit?: number }) => call<{ total: number; albums: LibraryAlbum[] }>(`/api/library-albums?${q(p)}`);

export interface AddPreview {
  album: LibraryAlbum & { type?: string };
  album_type?: string;
  type?: string;
  new_folder?: string;
  blocked?: boolean;
  existing: { title: string; n: string; disc: string; file: string; ext: string }[];
  naming: string;
  plan: { id: string; ok: boolean; name: string; from: string; renamed: boolean; folder: string; dup: 'title' | 'number' | ''; tags: Record<string, string> }[];
  warnings: Warning[];
}

export interface AddBody {
  album: string;
  tracks: { id: string; data: SendData }[];
  genres: 'album' | 'keep';
  rename: boolean;
  releasetype: string;
}

export const addToAlbumPreview = (body: AddBody) => call<AddPreview>('/api/add-to-album/preview', { json: body });
export const addToAlbum = (body: AddBody) => call<{ ok: boolean; album: string; results: { id: string; ok: boolean; dest?: string; error?: string }[] }>('/api/add-to-album', { json: body });

// ---- Covers ----

export interface ArtResult {
  thumb: string;
  full: string;
  label: string;
}

export const artSearch = (term: string) => call<ArtResult[]>(`/api/artsearch?${q({ q: term })}`);
export const folderImages = (tid: string) => call<{ folder: string; images: { name: string; size: number }[] }>(`/api/folder-images/${tid}`);

/** One cover on queue songs (each written at once, as MRQ's own cards do). */
export async function setTrackArt(tid: string, art: { url: string } | { file: Blob } | { folder: string }) {
  if ('url' in art) return call<{ ok: boolean }>(`/api/arturl/${tid}`, { json: { url: art.url } });
  if ('folder' in art) return call<{ ok: boolean }>(`/api/use-folder-art/${tid}`, { json: { name: art.folder } });
  const m = await multipart({}, art.file);
  // /api/track/<tid>/art takes only the image; the payload part is ignored.
  return call<{ ok: boolean }>(`/api/track/${tid}/art`, { body: m.body, contentType: m.contentType });
}

/** One cover on many files (queue or library), or none ({remove}). A job. */
export async function setArtMany(src: Src, paths: string[], art: { url: string } | { file: Blob } | { from: string } | { remove: true }) {
  if ('file' in art) {
    const m = await multipart({ src, paths }, art.file);
    return call<{ job: string }>('/api/tags/art', { body: m.body, contentType: m.contentType });
  }
  return call<{ job: string }>('/api/tags/art', { json: { src, paths, ...art } });
}

// ---- Genres and artists ----

export interface GenrePool {
  count: number;
  genres: string[];
  ignored: string[];
  map: Record<string, string> | [];
}

export const genrePool = () => call<GenrePool>('/api/genre-pool');
export const genreSuggest = (artist: string) => call<string[]>(`/api/genresuggest?${q({ artist })}`);
/** Genres for a release from MusicBrainz, Discogs and Last.fm, best first. */
export const rymTags = (artist: string, album: string) => call<string[]>(`/api/rymtags?${q({ artist, album })}`);
export const libraryArtists = () => call<string[]>('/api/library-artists?all=1');
export const tracklist = (artist: string, album: string) =>
  call<{ title: string; date: string; discs: number; total: number; tracks: { disc: number; pos: number; title: string }[] }[]>(`/api/tracklist?${q({ artist, album })}`);

// ---- The Tag Editor: every song of a source as rows ----

export type Src = 'S' | 'L';

export interface Row {
  p: string;
  title: string;
  artist: string[];
  albumartist: string[];
  album: string;
  date: string;
  genre: string[];
  tracknumber: string;
  discnumber: string;
  composer: string;
  releasetype: string;
  spotifyid: string;
  length: number;
  bitrate: number;
  ext: string;
  art: boolean;
  aw: number;
  ah: number;
  ab: number;
  id3: string;
  size: number;
  mt: number;
  error: string;
}

interface RowsAnswer {
  src: Src;
  cols: string[];
  rows: unknown[][];
  status?: LibraryStatus;
}

export function decodeRows(cols: string[], rows: unknown[][]): Row[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, i) => (o[c] = r[i]));
    for (const k of ['artist', 'albumartist', 'genre']) if (!Array.isArray(o[k])) o[k] = splitValues(String(o[k] ?? ''), k === 'genre');
    return o as unknown as Row;
  });
}

export async function getRows(src: Src): Promise<{ rows: Row[]; status?: LibraryStatus }> {
  const r = await call<RowsAnswer>(`/api/tags/rows?src=${src}`);
  return { rows: decodeRows(r.cols, r.rows), status: r.status };
}

/** The fields a batch can set. Lists are arrays. */
export type TagField = 'title' | 'artist' | 'albumartist' | 'album' | 'date' | 'genre' | 'tracknumber' | 'discnumber' | 'composer' | 'releasetype' | 'spotifyid';
export type TagSet = Partial<Record<TagField, string | string[]>>;

export interface BatchBody {
  src: Src;
  items: { p: string; set?: TagSet }[];
  set?: TagSet;
  clear?: TagField[];
  lists?: Partial<Record<'artist' | 'albumartist' | 'genre', { add?: string[]; remove?: string[]; rename?: [string, string] }>>;
  desc: string;
}

export interface BatchResult {
  changed: number;
  unchanged: number;
  rows: unknown[][];
  history: string;
}

export const batch = (body: BatchBody) => call<{ job: string }>('/api/tags/batch', { json: body });
export const toV24 = (src: Src, paths: string[]) => call<{ job: string }>('/api/tags/id3v24', { json: { src, paths } });

export interface Lookup {
  source: string;
  score: number;
  title: string;
  artist: string;
  album: string;
  albumartist: string;
  date: string;
  tracknumber: string;
  discnumber: string;
  releasetype: string;
  cover: string;
  link: string;
}

export interface LookupResult {
  good: number;
  results: Record<string, { m: Lookup | null; genre?: string[] }>;
}

export const autofillLookup = (items: { k: string; artist: string; title: string; album: string; length: number }[], fields: string[]) =>
  call<{ job: string }>('/api/autofill/lookup', { json: { items, fields, refresh: false } });

export interface RawTags {
  path: string;
  size: number;
  modified: number;
  id3: string;
  info: { codec: string; bitrate: number; sample_rate: number; channels: number; bits: number; length: number };
  tags: [string, string][];
}

export const rawTags = (src: Src, p: string) => call<RawTags>(`/api/tags/raw?${q({ src, p })}`);

// ---- History ----

export interface HistoryEntry {
  id: string;
  ts: number;
  desc: string;
  src: 'S' | 'L' | 'VS' | 'VL' | string;
  count: number;
  undone: boolean;
}

export const getHistory = () => call<HistoryEntry[]>('/api/tags/history');
export const undo = (id: string) => call<{ job: string }>('/api/tags/undo', { json: { id } });

// ---- Spotify ----

export interface SpotifyList {
  ok: boolean;
  kind: string;
  id: string;
  name: string;
  tracks: { id: string; title: string; artists: string[]; album: string; length: number; n: number }[];
}

export const spotifyTracks = (url: string) => call<SpotifyList>(`/api/spotify/tracks?${q({ url })}`);

// ---- Library index, beets' inbox, auto-genre ----

export interface LibraryStatus {
  scanning: boolean;
  phase: string;
  done: number;
  total: number;
  count: number;
  changed: number;
  removed: number;
  ts: number;
  error: string;
  version: number;
}

export const libraryStatus = () => call<LibraryStatus>('/api/library/status');
export const rescanLibrary = (full = false) => call<{ ok: boolean }>('/api/library/rescan', { json: { full } });
export const beetsInbox = () => call<{ ok: boolean; path: string; folders: { name: string; tracks: number }[]; loose: number; pending: boolean }>('/api/inbox');
export const importInbox = () => call<{ ok: boolean; folders: { name: string; tracks: number }[]; loose: number; tracks: number }>('/api/rescan-inbox', { json: {} });

export interface AutoGenreStatus {
  running: boolean;
  total: number;
  done: number;
  current: string;
  filled: number;
  tracks: number;
  skipped: number;
  notfound: string[] | number;
  errors: unknown[] | number;
}

export const autoGenreStatus = () => call<AutoGenreStatus>('/api/genre-autofill/status');
export const autoGenreStart = (overwrite = false) => call<{ ok: boolean }>('/api/genre-autofill', { json: { overwrite } });
export const autoGenreCancel = () => call<{ ok: boolean }>('/api/genre-autofill/cancel', { json: {} });

// ---- Tidy up: Big Brother, genres, artists ----

export interface BBFinding {
  id: string;
  check: string;
  title: string;
  detail: string[];
  severity: string;
  paths: string[];
  items: unknown[];
  fixes: { id: string; label: string; confirm?: string }[];
  ignored: boolean;
}

export interface BBReport {
  ts: number;
  duration: number;
  error: string;
  scanning: boolean;
  jellyfin: boolean | unknown;
  checks: { id: string; title: string; severity: string; doc: string }[];
  summary: Record<string, { count: number; skipped?: boolean; error?: string }>;
  findings: BBFinding[];
}

export const bbReport = () => call<BBReport>('/api/bb/report');
export const bbScan = () => call<{ job: string }>('/api/bb/scan', { json: {} });
export const bbFix = (id: string, fix: string) => call<{ job: string }>('/api/bb/fix', { json: { id, fix } });
export const bbFixAll = (check: string) => call<{ job: string }>('/api/bb/fixall', { json: { check } });
export const bbIgnore = (id: string, on: boolean) => call<{ ok: boolean }>('/api/bb/ignore', { json: { id, on } });

export interface GenreIssue {
  genre: string;
  count: number;
  reasons: string[];
  suggested: string;
}

export const genreCleanup = (rescan = false) => call<GenreIssue[]>(`/api/genre-cleanup${rescan ? '?rescan=1' : ''}`);
export const genreApply = (source: string, target: string) => call<{ ok: boolean; job: string; count: number }>('/api/genre-apply', { json: { source, target } });
export const genreIgnore = (genre: string, unignore = false) => call<{ ok: boolean }>('/api/genre-ignore', { json: { genre, unignore } });
export const artistDupes = () => call<{ names: string[]; suggested: string }[]>('/api/artist-dupes');
export const artistMerge = (names: string[], target: string) => call<{ ok: boolean; target: string; retagged: number }>('/api/artist-merge', { json: { names, target } });
export const libraryFixes = () => call<{ id: string; artist: string; count: number }[]>('/api/library-fixes');

// ---- Music videos ----

export interface VideoRow {
  p: string;
  file: string;
  title: string;
  artist: string[];
  album: string;
  year: string;
  genre: string[];
  director: string[];
  plot: string;
  ext: string;
  nfo: boolean;
  tagged: boolean;
  length: number;
  w: number;
  h: number;
  codec: string;
  size: number;
  mt: number;
  poster: string;
  pmt: number;
  guess: { artist: string; title: string };
  /** Library only: it's at Artist/Title/Artist - Title.ext. */
  filed?: boolean;
}

export interface VideoList {
  src: Src;
  root: string;
  configured: boolean;
  library: boolean;
  rows: VideoRow[];
  counts: { S: number; L: number };
}

export type VideoField = 'title' | 'artist' | 'album' | 'year' | 'genre' | 'director' | 'plot';
export type VideoSet = Partial<Record<VideoField, string | string[]>>;

export const getVideos = (src: Src) => call<VideoList>(`/api/videos?src=${src}`);
export const saveVideos = (src: Src, items: { p: string; set?: VideoSet }[], set: VideoSet, desc: string) =>
  call<{ job: string }>('/api/videos/save', { json: { src, items, set, desc } });
export const sendVideo = (p: string, set: VideoSet) => call<{ ok: boolean; p: string; row: VideoRow }>('/api/videos/send', { json: { p, set } });
export const refileVideo = (p: string, set: VideoSet) => call<{ ok: boolean; p: string; row: VideoRow }>('/api/videos/refile', { json: { p, set } });
export const rejectVideo = (p: string) => call<{ ok: boolean }>('/api/videos/reject', { json: { p } });

export interface LibSong {
  p: string;
  tid: string;
  title: string;
  artist: string[];
  albumartist: string[];
  album: string;
  date: string;
  genre: string[];
  score?: number;
  art: boolean;
  mt: number;
}

export const videoLibSongs = (p: { artist?: string; title?: string; q?: string }) => call<{ rows: LibSong[] }>(`/api/videos/libsongs?${q(p)}`);

export interface VideoMatch {
  title?: string;
  artist?: string[];
  year?: string;
  date?: string;
  album?: string;
  director?: string[];
  plot?: string;
  poster?: string;
  genre?: string[];
  from?: Record<string, string>;
}

export interface VideoLookup {
  results: Record<string, { m: VideoMatch | null; score: number; sources: Record<string, VideoMatch & { score?: number; link?: string }>; errors?: unknown }>;
}

export const videoLookup = (items: { k: string; artist: string; title: string; length: number }[]) => call<{ job: string }>('/api/videos/lookup', { json: { items, refresh: false } });

export async function setPoster(src: Src, p: string, art: { url: string } | { file: Blob } | { remove: true }) {
  if ('file' in art) {
    const m = await multipart({ src, p }, art.file);
    return call<{ ok: boolean; row: VideoRow }>('/api/videos/poster', { body: m.body, contentType: m.contentType });
  }
  return call<{ ok: boolean; row: VideoRow }>('/api/videos/poster', { json: { src, p, ...art } });
}
