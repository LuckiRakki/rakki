// Typo-tolerant matching for Search. Jellyfin only matches exact substrings, so Rakki keeps a
// small name index of the library on the device (see index.ts) and scores it here.
//
// A query matches when every word in it matches a word of the name (or, for songs and
// albums, of the artist): exactly, as a prefix, or within a few typos (Damerau distance: one
// edit for words of 4-6 letters, two for longer). The last word may still be half-typed, so
// it also matches word prefixes with typos. "tame impla", "kanye wset", "radiohed" all work.

export type Kind = 'Audio' | 'MusicAlbum' | 'MusicArtist' | 'Playlist' | 'Genre';

export interface Entry {
  id: string;
  kind: Kind;
  name: string;
  /** Artist line for songs and albums. */
  by?: string;
}

interface Prepared {
  entry: Entry;
  full: string;
  flat: string;
  /** Word ids into the index vocabulary. */
  words: number[];
  byWords: number[];
}

/**
 * Entries plus a shared vocabulary. Many names share words (artist names repeat across
 * thousands of songs), so each query word is scored once per distinct word, not per entry.
 */
export interface FuzzyIndex {
  items: Prepared[];
  vocab: string[];
}

/** Lowercase, no accents, no zero-width characters, punctuation turned into spaces. */
export function normalize(s: string): string {
  let out = s.toLowerCase().replace(/[​-‏⁠﻿]/g, '');
  try {
    out = out.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  } catch {
    // No Intl normalisation available: accents just stay as they are.
  }
  return out
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[\s!-/:-@[-`{-~ -⁯　-〿]+/g, ' ')
    .trim();
}

export function prepare(entries: Entry[]): FuzzyIndex {
  const vocab: string[] = [];
  const ids = new Map<string, number>();
  const idOf = (w: string) => {
    let id = ids.get(w);
    if (id === undefined) {
      id = vocab.length;
      vocab.push(w);
      ids.set(w, id);
    }
    return id;
  };
  const items = entries.map((entry) => {
    const full = normalize(entry.name);
    const by = entry.by ? normalize(entry.by) : '';
    return {
      entry,
      full,
      flat: full.replace(/ /g, ''),
      words: full ? full.split(' ').map(idOf) : [],
      byWords: by ? by.split(' ').map(idOf) : [],
    };
  });
  return { items, vocab };
}

/** Typos allowed in a word of this length. */
function allowance(len: number): number {
  return len <= 3 ? 0 : len <= 6 ? 1 : 2;
}

/** Optimal-string-alignment distance, or max + 1 as soon as it's clearly above `max`. */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** How well query word `q` matches word `w` (0 = not at all, 1 = exactly). */
function wordScore(q: string, w: string, last: boolean): number {
  if (w === q) return 1;
  if (w.startsWith(q)) return last ? 0.9 : 0.7;
  const k = allowance(q.length);
  if (k === 0) return 0;
  const d = distance(q, w, k);
  if (d <= k) return 0.85 - 0.12 * d;
  if (last && w.length > q.length) {
    // Still typing: compare against the start of the word, give or take a letter.
    const p = Math.min(
      distance(q, w.slice(0, q.length), k),
      distance(q, w.slice(0, q.length + 1), k),
      q.length > 1 ? distance(q, w.slice(0, q.length - 1), k) : k + 1,
    );
    if (p <= k) return 0.7 - 0.12 * p;
  }
  return 0;
}

const KIND_BONUS: Record<Kind, number> = { MusicArtist: 4, MusicAlbum: 2, Playlist: 2, Genre: 1, Audio: 0 };

/** 0 when `p` doesn't match; otherwise higher is better (an exact name scores 150+). */
function scoreOne(p: Prepared, table: Float64Array[], qFull: string, qFlat: string): number {
  if (!p.full) return 0;
  let total = 0;
  let inName = 0;
  for (const scores of table) {
    let best = 0;
    let bestIsName = false;
    for (const w of p.words) {
      if (scores[w] > best) {
        best = scores[w];
        bestIsName = true;
      }
    }
    if (best < 1) {
      for (const w of p.byWords) {
        const s = scores[w] * 0.85;
        if (s > best) {
          best = s;
          bestIsName = false;
        }
      }
    }
    if (best === 0) return flatScore(p, qFlat);
    total += best;
    if (bestIsName) inName++;
  }
  // Only the artist matched ("tame impala" → their songs): listed, but below name matches.
  if (inName === 0) return (total / table.length) * 80;
  let score = (total / table.length) * 100;
  // Prefer names the query covers well: "blur" → Blur before Blurryface.
  score += (10 * Math.min(inName, p.words.length)) / p.words.length;
  if (p.full === qFull) score += 40;
  else if (p.full.startsWith(qFull)) score += 15;
  return score + KIND_BONUS[p.entry.kind];
}

/** For each query word, its score against every vocabulary word. */
function scoreTable(vocab: string[], qWords: string[]): Float64Array[] {
  return qWords.map((q, i) => {
    const last = i === qWords.length - 1;
    const row = new Float64Array(vocab.length);
    for (let v = 0; v < vocab.length; v++) row[v] = wordScore(q, vocab[v], last);
    return row;
  });
}

/** Spaces typed wrong: "tameimpala", "radio head". */
function flatScore(p: Prepared, qFlat: string): number {
  if (qFlat.length < 4) return 0;
  if (p.flat === qFlat) return 95 + KIND_BONUS[p.entry.kind];
  if (p.flat.startsWith(qFlat)) return 75 + KIND_BONUS[p.entry.kind];
  const k = allowance(qFlat.length);
  const d = distance(qFlat, p.flat, k);
  return d <= k ? 80 - 10 * d + KIND_BONUS[p.entry.kind] : 0;
}

export interface Match {
  entry: Entry;
  score: number;
}

/** Best matches for `query`, highest score first, at most `limit` per kind. */
export function fuzzySearch(index: FuzzyIndex, query: string, limit = 20): Match[] {
  const qFull = normalize(query);
  if (!qFull) return [];
  const qWords = qFull.split(' ');
  const qFlat = qFull.replace(/ /g, '');
  const table = scoreTable(index.vocab, qWords);
  const out: Match[] = [];
  for (const p of index.items) {
    const score = scoreOne(p, table, qFull, qFlat);
    if (score >= 55) out.push({ entry: p.entry, score });
  }
  out.sort((a, b) => b.score - a.score);
  const perKind = new Map<Kind, number>();
  return out.filter((m) => {
    const n = perKind.get(m.entry.kind) ?? 0;
    perKind.set(m.entry.kind, n + 1);
    return n < limit;
  });
}

/** Score an item that came from somewhere else (the server's own search) the same way. */
export function scoreName(entry: Entry, query: string): number {
  const qFull = normalize(query);
  if (!qFull) return 0;
  const index = prepare([entry]);
  const qWords = qFull.split(' ');
  return scoreOne(index.items[0], scoreTable(index.vocab, qWords), qFull, qFull.replace(/ /g, ''));
}
