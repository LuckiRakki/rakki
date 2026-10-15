// What the pages loaded, kept on this computer between launches (IndexedDB), so Home, artists,
// albums and genres show at once on the next launch and refresh from the server behind them.
// Pictures are the webview's own disk cache; until one loads, its blurred colour (blurhash)
// shows in its place. Saved a few seconds after things change, never while nothing does.
import { dehydrate, hydrate, type DehydratedState, type Query } from '@tanstack/react-query';

import { queryClient } from '~/queries';

const DB = 'rakki-cache';
const STORE = 'queries';
const KEY = 'v1';
/** Answers that change by the minute (or are someone else's to keep) aren't kept. */
const SKIP = new Set(['onAir', 'related', 'search', 'searchIndex', 'lyricsSearch', 'albumLastfm']);
/** Kept for a week; older is dropped on load. */
const MAX_AGE = 7 * 24 * 3600_000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function read(): Promise<unknown> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function write(value: unknown): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const keep = (q: Query) => q.state.status === 'success' && !SKIP.has(String(q.queryKey[0]));

/** Load last time's answers into the query cache (before the first page draws). */
export async function restoreCache(): Promise<void> {
  try {
    const saved = (await Promise.race([read(), new Promise((r) => setTimeout(() => r(null), 800))])) as { at: number; state: DehydratedState } | null;
    if (saved && Date.now() - saved.at < MAX_AGE) hydrate(queryClient, saved.state);
  } catch {
    // Nothing kept, or the browser storage is unavailable: pages load as usual.
  }
}

/** Keep the answers as they change (a few seconds after the last change). */
export function startCacheSaving() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  queryClient.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' || e.action.type !== 'success') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void write({ at: Date.now(), state: dehydrate(queryClient, { shouldDehydrateQuery: keep }) }).catch(() => {});
    }, 4000);
  });
}

/** Signing out: forget what this account loaded. */
export function clearCache() {
  void write(null).catch(() => {});
}
