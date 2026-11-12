// Lyrics files from this computer, for Sync Lyrics' Upload a File (LyricsMaker.tsx). A timed
// file goes straight to your server as the song's lyrics, through the Rakki plugin like lyrics
// made by tapping (lyrics/maker.ts): TTML (.ttml, .xml) exactly as it is, so word timing, duets
// and background vocals all stay, and LRC (.lrc, enhanced LRC's word times too) turned into TTML,
// the one format the plugin keeps. Words without times (a .txt, or an .lrc with no times) go in
// the words box to tap along to.
import type { LyricLine, WordCue } from '@/lyrics/types';
import { draftFromLyrics, toTtml } from '~/lyrics/maker';

export type LyricsFile =
  /** Ready for the server: TTML, and how many lines it has. */
  | { kind: 'timed'; ttml: string; lines: number; words: boolean }
  /** Only words: to tap along to. */
  | { kind: 'text'; text: string };

export class LyricsFileError extends Error {}

/** What the file picker offers. */
export const LYRICS_FILE_TYPES = '.lrc,.ttml,.xml,.txt,text/plain,application/ttml+xml';
/** The plugin takes lyrics up to 1 MB. */
const MAX_BYTES = 1024 * 1024;

export async function readLyricsFile(file: File, song: { itemId: string; title?: string; artist?: string; durationMs?: number }): Promise<LyricsFile> {
  if (file.size > MAX_BYTES) throw new LyricsFileError('That file is over 1 MB, too big for lyrics.');
  const text = (await file.text().catch(() => null))?.replace(/^﻿/, '');
  if (text == null) throw new LyricsFileError("Couldn't read that file.");
  if (!text.trim()) throw new LyricsFileError('That file is empty.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.ttml') || name.endsWith('.xml') || /^\s*(<\?xml[^>]*>\s*)?<tt[\s>]/.test(text)) return readTtml(text);
  const lrc = parseLrc(text, song.durationMs);
  if (lrc) {
    const draft = draftFromLyrics(song.itemId, lrc.lines);
    return { kind: 'timed', ttml: toTtml(draft, { title: song.title, artist: song.artist }), lines: lrc.lines.length, words: lrc.words };
  }
  // No times: the words alone (an .lrc's tags left out).
  const words = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*\[[a-z#]+:.*\]\s*$/i.test(l))
    .map((l) => l.replace(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]|<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!words) throw new LyricsFileError('No lyrics found in that file.');
  return { kind: 'text', text: words };
}

// ---- TTML ----

function readTtml(text: string): LyricsFile {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'tt') throw new LyricsFileError("That TTML file doesn't read as TTML.");
  const ps = [...doc.getElementsByTagNameNS('*', 'p')];
  const timed = ps.filter((p) => p.getAttribute('begin') && (p.textContent ?? '').trim());
  if (!timed.length) throw new LyricsFileError('That TTML file has no timed lines.');
  const words = timed.some((p) => [...p.getElementsByTagNameNS('*', 'span')].some((s) => s.getAttribute('begin')));
  return { kind: 'timed', ttml: text, lines: timed.length, words };
}

// ---- LRC ----

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_STAMP = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

const ms = (m: string, s: string, frac?: string) => Number(m) * 60_000 + Number(s) * 1000 + (frac ? Math.round(Number(`0.${frac}`) * 1000) : 0);

/** Timed LRC lines (null when nothing has a time). Enhanced LRC's <mm:ss.xx> word times are kept. */
export function parseLrc(text: string, durationMs?: number): { lines: LyricLine[]; words: boolean } | null {
  let offset = 0;
  const raw: { start: number; text: string; words?: { start: number; text: string }[] }[] = [];
  for (const row of text.replace(/\r/g, '').split('\n')) {
    const off = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(row);
    if (off) {
      // A positive offset shows the lyrics sooner.
      offset = -Number(off[1]);
      continue;
    }
    const stamps = [...row.matchAll(STAMP)];
    if (!stamps.length) continue;
    const rest = row.replace(STAMP, '');
    // Word times: "<00:12.30>Hello <00:12.80>world"
    const marks = [...rest.matchAll(WORD_STAMP)];
    let words: { start: number; text: string }[] | undefined;
    if (marks.length) {
      words = marks
        .map((m, i) => ({ start: ms(m[1], m[2], m[3]), text: rest.slice(m.index + m[0].length, marks[i + 1]?.index ?? rest.length).trim() }))
        .filter((w) => w.text);
    }
    const line = rest.replace(WORD_STAMP, '').replace(/\s+/g, ' ').trim();
    // One row for several times (a repeated chorus): its word times only fit the first.
    for (const st of stamps) raw.push({ start: ms(st[1], st[2], st[3]), text: line, words: stamps.length > 1 ? undefined : words });
  }
  const sung = raw.filter((l) => l.text).sort((a, b) => a.start - b.start);
  if (!sung.length) return null;
  // An empty timed row is where the singing stops: the line before ends there.
  const stops = raw.filter((l) => !l.text).map((l) => l.start);
  const lines: LyricLine[] = sung.map((l, i) => {
    const start = Math.max(0, l.start + offset);
    const nextStart = sung[i + 1] ? sung[i + 1].start + offset : undefined;
    const stop = stops.find((s) => s > l.start && (nextStart === undefined || s + offset < nextStart));
    const end = Math.max(start + 1, stop !== undefined ? stop + offset : (nextStart ?? Math.max(start + 4000, durationMs ?? 0)));
    const ws: WordCue[] | undefined = l.words?.length
      ? l.words.map((w, k) => {
          const ws0 = Math.max(0, w.start + offset);
          const next = l.words?.[k + 1];
          return { text: w.text, startMs: ws0, endMs: Math.max(ws0 + 1, next ? next.start + offset : end) };
        })
      : undefined;
    return { text: l.text, startMs: start, endMs: end, words: ws };
  });
  // The last line runs to the song's end only when that's near; else a few seconds.
  const last = lines[lines.length - 1];
  if (!stops.some((s) => s + offset > last.startMs) && durationMs && durationMs - last.startMs > 15_000) last.endMs = last.startMs + 6000;
  return { lines, words: lines.some((l) => l.words?.length) };
}
