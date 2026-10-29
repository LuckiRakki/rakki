// Which parts of a page had nothing to show last time (Home's shelves, lib/reveal.ts): those
// don't hold a place while they load, so a shelf that's always empty for you (no Daily Mixes
// yet, no music videos) never flashes a placeholder that then folds away. Remembered on the
// device; a shelf that fills up again simply shows up, and holds its place from then on.
import { readPref, writePref } from '@/lib/prefs';

const KEY = 'rakki.emptyParts';
let empty: Set<string> | undefined;

function load(): Set<string> {
  if (!empty) {
    try {
      const saved: unknown = JSON.parse(readPref(KEY) ?? '[]');
      empty = new Set(Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      empty = new Set();
    }
  }
  return empty;
}

/** Whether this part had nothing to show last time. */
export function wasEmpty(key: string): boolean {
  return load().has(key);
}

/** Remember whether this part had something to show. */
export function noteEmpty(key: string, isEmpty: boolean) {
  const set = load();
  if (set.has(key) === isEmpty) return;
  if (isEmpty) set.add(key);
  else set.delete(key);
  writePref(KEY, JSON.stringify([...set]));
}
