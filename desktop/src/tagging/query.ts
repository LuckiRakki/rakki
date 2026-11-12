// The library table's search, MRQ's Tag Editor syntax: plain words, "a phrase", field:text (contains),
// field=text (equals one of its values), numbers (year>=2020, length>600, kbps<192, genres:1, art<600),
// missing:field / has:field / no:field, malformed:genre, has:invisible, has:feat, id3:2.3, and a
// leading minus to exclude. Terms combine with AND. Also the ready-made problem filters.
import type { Row } from '~/tagging/api';
import { featMissing } from '~/tagging/data';

const TEXT: Record<string, (r: Row) => string[]> = {
  title: (r) => [r.title],
  artist: (r) => r.artist,
  aa: (r) => r.albumartist,
  albumartist: (r) => r.albumartist,
  album: (r) => [r.album],
  genre: (r) => r.genre,
  year: (r) => [r.date],
  date: (r) => [r.date],
  track: (r) => [r.tracknumber],
  disc: (r) => [r.discnumber],
  composer: (r) => [r.composer],
  type: (r) => [r.releasetype],
  path: (r) => [r.p],
  format: (r) => [r.ext],
  spotify: (r) => [r.spotifyid],
};

const NUM: Record<string, (r: Row) => number> = {
  year: (r) => parseInt(r.date, 10) || 0,
  track: (r) => parseInt(r.tracknumber, 10) || 0,
  disc: (r) => parseInt(r.discnumber, 10) || 0,
  length: (r) => r.length,
  kbps: (r) => r.bitrate,
  genres: (r) => r.genre.length,
  art: (r) => (r.art ? Math.min(r.aw, r.ah) : 0),
};

const INVISIBLE = /[​-‏⁠﻿ ]/;
const all = (r: Row) => [r.title, ...r.artist, ...r.albumartist, r.album, ...r.genre, r.composer, r.p];
const empty = (r: Row, f: string) => (TEXT[f]?.(r) ?? []).every((v) => !v?.trim()) && !(f === 'art' && r.art);

type Test = (r: Row) => boolean;

function term(raw: string): Test | null {
  const m = /^([a-z]+)(:|=|>=|<=|>|<)(.*)$/i.exec(raw);
  if (m) {
    const [, f0, op, v0] = m;
    const f = f0.toLowerCase();
    const v = v0.replace(/^"|"$/g, '').toLowerCase();
    if (f === 'missing' || f === 'no') return (r) => (v === 'art' || v === 'cover' ? !r.art : empty(r, v === 'spotifyid' ? 'spotify' : v));
    if (f === 'has') {
      if (v === 'invisible') return (r) => all(r).some((x) => INVISIBLE.test(x)) || all(r).some((x) => x !== x.trim() || /\s{2}/.test(x));
      if (v === 'feat') return (r) => !!featMissing(r.title, r.artist);
      if (v === 'art' || v === 'cover') return (r) => r.art;
      return (r) => !empty(r, v === 'spotifyid' ? 'spotify' : v);
    }
    if (f === 'malformed') {
      if (v === 'genre') return (r) => r.genre.some((g) => /[/;\\]/.test(g));
      if (v === 'artist') return (r) => [...r.artist, ...r.albumartist].some((a) => /;/.test(a));
      return null;
    }
    if (f === 'id3') return (r) => r.id3.toLowerCase().startsWith(v);
    if (NUM[f] && (op !== ':' || /^\d+$/.test(v)) && op !== '=') {
      const n = parseFloat(v);
      if (Number.isNaN(n)) return null;
      const get = NUM[f];
      return (r) => {
        const x = get(r);
        return op === '>' ? x > n : op === '<' ? x < n : op === '>=' ? x >= n : op === '<=' ? x <= n : x === n;
      };
    }
    const get = TEXT[f];
    if (!get) return null;
    if (op === '=') return (r) => get(r).some((x) => x.toLowerCase() === v);
    return (r) => get(r).some((x) => x.toLowerCase().includes(v));
  }
  const w = raw.replace(/^"|"$/g, '').toLowerCase();
  if (!w) return null;
  return (r) => all(r).some((x) => x.toLowerCase().includes(w));
}

/** A search → a test for each row (null: show everything). */
export function parseQuery(text: string): Test | null {
  const tests: Test[] = [];
  for (const m of text.matchAll(/(-?)((?:[a-z]+(?::|=|>=|<=|>|<))?(?:"[^"]*"|\S+))/gi)) {
    const t = term(m[2]);
    if (!t) continue;
    tests.push(m[1] ? (r) => !t(r) : t);
  }
  return tests.length ? (r) => tests.every((t) => t(r)) : null;
}

/** The problems worth a look, as ready-made searches. */
export const SMART: { label: string; query: string }[] = [
  { label: 'No Genre', query: 'missing:genre' },
  { label: 'Only One Genre', query: 'genres:1' },
  { label: 'No Year', query: 'missing:year' },
  { label: 'No Album Artist', query: 'missing:aa' },
  { label: 'No Cover', query: 'no:art' },
  { label: 'Small Cover (Under 600 px)', query: 'art<600 has:art' },
  { label: 'No Spotify Link', query: 'missing:spotify' },
  { label: 'Several Genres in One', query: 'malformed:genre' },
  { label: 'Artists Joined With ;', query: 'malformed:artist' },
  { label: 'Hidden Characters or Extra Spaces', query: 'has:invisible' },
  { label: 'feat. Only in the Title', query: 'has:feat' },
  { label: 'Old ID3v2.3 Tags', query: 'id3:2.3' },
];
