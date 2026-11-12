// Tagging's data from MRQ, shared by its tabs through TanStack Query (keys start with 'mrq'), plus
// the small helpers every tab uses: the genre vocabulary and its spell-check, library artists,
// and patching the library's rows after an edit without asking MRQ for all of them again.
import { useQuery } from '@tanstack/react-query';

import { queryClient } from '~/queries';
import { useMrq } from '~/mrq/client';
import { decodeRows, genrePool, getRows, libraryArtists, type Row, type Src } from '~/tagging/api';

export const useMrqUrl = () => useMrq((s) => s.url);

export function useGenrePool() {
  const url = useMrqUrl();
  return useQuery({ queryKey: ['mrq', url, 'genre-pool'], queryFn: genrePool, staleTime: 10 * 60_000, enabled: !!url });
}

export function useLibraryArtists() {
  const url = useMrqUrl();
  return useQuery({ queryKey: ['mrq', url, 'library-artists'], queryFn: libraryArtists, staleTime: 10 * 60_000, enabled: !!url });
}

export function useRows(src: Src) {
  const url = useMrqUrl();
  return useQuery({ queryKey: ['mrq', url, 'rows', src], queryFn: () => getRows(src), staleTime: 60_000, enabled: !!url });
}

/** Put the rows a finished edit sent back in place of the old ones (same files by path). */
export function patchRows(src: Src, cols: string[] | undefined, changed: unknown[][] | undefined, renamed?: Map<string, string>) {
  if (!changed?.length && !renamed?.size) return;
  const url = useMrq.getState().url;
  const fresh = changed?.length ? decodeRows(cols ?? ROW_COLS, changed) : [];
  const byPath = new Map(fresh.map((r) => [r.p, r]));
  queryClient.setQueryData<{ rows: Row[] }>(['mrq', url, 'rows', src], (old) =>
    old ? { ...old, rows: old.rows.map((r) => byPath.get(renamed?.get(r.p) ?? r.p) ?? r) } : old,
  );
}

/** MRQ's column order for rows (job results send rows in it without naming the columns). */
export const ROW_COLS = ['p', 'title', 'artist', 'albumartist', 'album', 'date', 'genre', 'tracknumber', 'discnumber', 'composer', 'releasetype', 'spotifyid', 'length', 'bitrate', 'ext', 'art', 'aw', 'ah', 'ab', 'id3', 'size', 'mt', 'error'];

/** Ask MRQ again (after a send, an undo, a fix): every list under Tagging, and Rakki's own a moment later. */
export function refreshTagging(what: 'all' | 'queue' | 'library' | 'videos' = 'all') {
  const url = useMrq.getState().url;
  const keys: Record<string, string[][]> = {
    all: [['mrq', url]],
    queue: [['mrq', url, 'groups'], ['mrq', url, 'group'], ['mrq', url, 'rows', 'S'], ['mrq', url, 'history']],
    library: [['mrq', url, 'rows', 'L'], ['mrq', url, 'history'], ['mrq', url, 'library-artists']],
    videos: [['mrq', url, 'videos'], ['mrq', url, 'history']],
  };
  for (const k of keys[what]) void queryClient.invalidateQueries({ queryKey: k });
}

/** Rakki's own lists catch up once Jellyfin has read the changed files (MRQ asks it to). */
export function refreshRakkiSoon() {
  setTimeout(() => void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'mrq' }), 4000);
}

// ---- Spell-checking genres against the library's ----

/** Lower-case, no spaces, dashes, "and"/"n"/"&": "Drum N Bass" and "drum-and-bass" meet. */
export const genreKey = (g: string) =>
  g
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(and|n)\b|&|'n'/g, 'and')
    .replace(/[^a-z0-9]+/g, '');

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = keep;
    }
  }
  return prev[b.length];
}

export type GenreCheck = { kind: 'ok' } | { kind: 'new' } | { kind: 'spelling'; use: string } | { kind: 'malformed' };

/** Is a genre the library's own, a new one, or most likely another spelling of one it has? */
export function checkGenre(g: string, pool: string[] | undefined): GenreCheck {
  if (/[/;\\]/.test(g)) return { kind: 'malformed' };
  if (!pool?.length) return { kind: 'ok' };
  if (pool.includes(g)) return { kind: 'ok' };
  const k = genreKey(g);
  const same = pool.find((p) => genreKey(p) === k);
  if (same) return { kind: 'spelling', use: same };
  if (k.length >= 6) {
    const near = pool.find((p) => {
      const pk = genreKey(p);
      return pk.length >= 6 && distance(k, pk) <= (k.length >= 10 ? 2 : 1);
    });
    if (near) return { kind: 'spelling', use: near };
  }
  return { kind: 'new' };
}

/** A name in the library's own spelling, when it has one that differs only by case or spaces. */
export function librarySpelling(name: string, artists: string[] | undefined): string {
  const k = name.toLowerCase().replace(/\s+/g, ' ').trim();
  return artists?.find((a) => a.toLowerCase() === k) ?? name;
}

// ---- "Song (feat. A & B)": artists only in the title ----

const FEAT = /\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\s+([^)\]]+)[)\]]|\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$/i;

/** The artists a title credits that aren't in Artists yet, and the title without them. */
export function featMissing(title: string, artists: string[], known?: string[]): { missing: string[]; rest: string } | null {
  const m = FEAT.exec(title);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? '').trim();
  const have = new Set(artists.map((a) => a.toLowerCase()));
  // Names the library knows stay whole ("Tyler, The Creator"); the rest split on , & and x.
  const whole = known?.find((k) => k.toLowerCase() === raw.toLowerCase());
  const names = whole ? [whole] : raw.split(/\s*(?:,|&|\band\b|\bx\b)\s*/i).map((n) => librarySpelling(n.trim(), known)).filter(Boolean);
  const missing = names.filter((n) => !have.has(n.toLowerCase()));
  if (!missing.length) return null;
  return { missing, rest: title.replace(FEAT, '').trim() };
}

export const fmtLength = (s: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
export const trackNo = (t: string) => parseInt(t, 10) || 0;
