// Rakki's own data (settings, lyric timings and drafts, the queue, caches), kept as readable
// files in one folder: %LOCALAPPDATA%\Rakki on Windows (Rakki Dev: "Rakki Dev"), ~/.local/share/Rakki
// on Linux. src-tauri/src/data.rs reads and writes the files; this decides what goes where:
//
//   settings.json          every setting, by its name (rakki.look, rakki.discord, ...)
//   lyrics-offsets.json    each song's lyric timing, in milliseconds
//   lyrics-drafts/<id>.json  a song's unsaved tap-to-sync lyrics
//   queue.json             what was playing, to pick up where you left off
//   cache/...              things Rakki can fetch again (search index, playlists, Last.fm, pages)
//
// The sign-in token is never in a file: it goes to Windows' Credential Manager (data.rs), and
// settings.json keeps the rest of the account. Everything is read once before the interface
// starts (src/boot.ts), so reading stays instant like the browser storage it replaces; writes go
// out a moment later. The first launch with this moves what the browser storage had into the
// folder, then empties it. In a plain browser tab (`npm run dev`), it is the browser's storage.
import { invoke } from '@tauri-apps/api/core';

import { inTauri } from '~/lib/tauri';

interface Place {
  file: string;
  /** The file is this one value (else an object of values by name). */
  whole?: boolean;
  /** Indented, for files you might open. */
  pretty?: boolean;
  /** Milliseconds to wait for more changes before writing. */
  delay: number;
}

/** The account's field kept in the Credential Manager instead. */
const SESSION = 'rakki.session';
const OFFSETS = 'lyrics-offsets.json';
const DRAFTS = /^lyrics-drafts\/([A-Za-z0-9_-]+)\.json$/;

const places = new Map<string, Place>();

function placeOf(key: string): Place {
  let place = places.get(key);
  if (!place) {
    const k = key.startsWith('rakki.') ? key.slice(6) : key;
    const draft = /^lyricsDraft\.([A-Za-z0-9_-]+)$/.exec(k);
    if (k === 'lyricsOffsets') place = { file: OFFSETS, whole: true, pretty: true, delay: 0 };
    else if (draft) place = { file: `lyrics-drafts/${draft[1]}.json`, whole: true, pretty: true, delay: 300 };
    else if (/^(lastQueue|queue\.|queuePosition\.)/.test(k)) place = { file: 'queue.json', delay: 0 };
    else if (k.startsWith('searchIndex.')) place = { file: 'cache/search-index.json', delay: 1500 };
    else if (k.startsWith('playlistCache.')) place = { file: 'cache/playlists.json', delay: 1500 };
    else if (k.startsWith('lastfm.')) place = { file: 'cache/lastfm.json', delay: 1500 };
    else place = { file: 'settings.json', pretty: true, delay: 0 };
    places.set(key, place);
  }
  return place;
}

/** A stored string as it reads best in a file: JSON as itself, anything else as text. */
function encode(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'string') return parsed;
  } catch {}
  return value;
}

const decode = (stored: unknown): string => (typeof stored === 'string' ? stored : JSON.stringify(stored));

const values = new Map<string, string>();
let token: string | null = null;
let folder = '';
/** Files (by path) waiting to be written, and each file's write count (data.rs skips stale ones). */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const seqs = new Map<string, number>();
let useBrowser = !inTauri;

/** Where the files are, for Settings ('' in a browser tab). */
export const dataFolder = () => folder;

function contents(file: string): string | null {
  const place = [...places.values()].find((p) => p.file === file);
  if (place?.whole) {
    const key = [...values.keys()].find((k) => placeOf(k).file === file);
    return key === undefined ? null : JSON.stringify(encode(values.get(key)!), null, 2);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of [...values].sort(([a], [b]) => a.localeCompare(b))) {
    if (placeOf(key).file !== file) continue;
    const stored = encode(value);
    if (key === SESSION && stored && typeof stored === 'object') {
      const account = { ...(stored as Record<string, unknown>) };
      delete account.token;
      out[key] = account;
    } else out[key] = stored;
  }
  if (!Object.keys(out).length && file !== 'settings.json') return null;
  return place?.pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
}

/** Whether it was written. */
function send(path: string, text: string | null): Promise<boolean> {
  const seq = (seqs.get(path) ?? 0) + 1;
  seqs.set(path, seq);
  return invoke<void>('data_write', { path, text, seq }).then(
    () => true,
    (e: unknown) => {
      console.warn(`[data] ${String(e)}`);
      return false;
    },
  );
}

function flush(file: string): Promise<boolean> {
  const timer = timers.get(file);
  if (timer) clearTimeout(timer);
  timers.delete(file);
  return send(file, contents(file));
}

/** Write everything waiting now (leaving, hiding to the tray); whether all of it was written. */
export function flushData(): Promise<boolean> {
  return Promise.all([...timers.keys()].map(flush)).then((done) => done.every(Boolean));
}

function changed(key: string) {
  const { file, delay } = placeOf(key);
  if (timers.has(file)) return;
  timers.set(file, setTimeout(() => void flush(file), delay));
}

function keepToken(value: string | null) {
  let next: string | null = null;
  try {
    next = value ? ((JSON.parse(value) as { token?: string }).token ?? null) : null;
  } catch {}
  if (next === token) return;
  token = next;
  invoke('data_token', { token: next }).catch((e: unknown) => console.warn(`[data] ${String(e)}`));
}

/** The same calls as the browser's localStorage. */
export const kv = {
  getItem(key: string): string | null {
    if (useBrowser) return localStorage.getItem(key);
    return values.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    if (useBrowser) return localStorage.setItem(key, value);
    if (values.get(key) === value) return;
    values.set(key, value);
    if (key === SESSION) keepToken(value);
    changed(key);
  },
  removeItem(key: string): void {
    if (useBrowser) return localStorage.removeItem(key);
    if (!values.has(key)) return;
    values.delete(key);
    if (key === SESSION) keepToken(null);
    changed(key);
  },
};

/** Larger files read and written on their own (the pages kept between launches). */
export async function readData(path: string): Promise<string | null> {
  if (useBrowser) return localStorage.getItem(`rakki.file.${path}`);
  return invoke<string | null>('data_read', { path });
}

export async function writeData(path: string, text: string | null): Promise<void> {
  if (useBrowser) return text === null ? localStorage.removeItem(`rakki.file.${path}`) : localStorage.setItem(`rakki.file.${path}`, text);
  await send(path, text);
}

/** Read the folder (src/boot.ts, before anything else runs); the first time, move the browser storage's data into it. */
export async function loadData(): Promise<void> {
  if (!inTauri) return;
  let loaded: { dir: string; files: Record<string, string>; token: string | null };
  try {
    loaded = await invoke('data_load');
  } catch (e) {
    // The folder can't be read: carry on with the browser storage rather than losing settings.
    console.warn(`[data] ${String(e)}`);
    useBrowser = true;
    return;
  }
  folder = loaded.dir;
  token = loaded.token;
  for (const [file, text] of Object.entries(loaded.files)) {
    let stored: unknown;
    try {
      stored = JSON.parse(text);
    } catch {
      console.warn(`[data] ${file} isn't valid JSON, so it was skipped`);
      continue;
    }
    const draft = DRAFTS.exec(file);
    if (file === OFFSETS) values.set('rakki.lyricsOffsets', decode(stored));
    else if (draft) values.set(`rakki.lyricsDraft.${draft[1]}`, decode(stored));
    else if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
        // The account without its token (the Credential Manager lost it): sign in again.
        if (key === SESSION) {
          if (token && value && typeof value === 'object') values.set(key, JSON.stringify({ ...value, token }));
        } else values.set(key, decode(value));
      }
    }
  }
  // Seen once so flushes know each file's shape, even before anything changes.
  for (const key of values.keys()) placeOf(key);

  window.addEventListener('pagehide', () => void flushData());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flushData());

  if (Object.keys(loaded.files).length || token || !localStorage.length) return;
  // First launch with the folder: bring over what the browser storage had, then empty it.
  const old: [string, string][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = key === null ? null : localStorage.getItem(key);
    if (key !== null && value !== null) old.push([key, value]);
  }
  for (const [key, value] of old) kv.setItem(key, value);
  const written = await flushData();
  const kept = !token || (await invoke('data_token', { token }).then(() => true, () => false));
  // If anything wasn't written, the browser storage keeps its copy (nothing is lost).
  if (written && kept) localStorage.clear();
}
