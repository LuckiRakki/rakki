// Making synced lyrics by tapping along (the lyrics maker, LyricsMaker.tsx). Paste the words,
// play the song, and tap as each line (or, in word mode, each word) starts; a tap also ends the
// one before. A blank line in the pasted text is a pause: its tap ends the line before without
// starting another. After the last line one more tap ends it.
//
// Everything here is plain functions on a Draft (each returns a new one), kept on this
// computer while you work (loadDraft / saveDraftLocal). Saving turns it into TTML, the format
// every Rakki already shows word by word, and the Rakki plugin keeps it on the server (plugin
// 0.3: PUT /Rakki/Lyrics/{id}), apart from the music files. The server then hands them out
// before any other lyrics for the song, credited "Synced by" you.
import type { BaseItem } from '@/api/jellyfin';
import type { LyricLine } from '@/lyrics/types';
import { queryClient } from '~/queries';
import { PluginError, pluginRequest, pluginVersion, versionAtLeast } from '~/lib/plugin';

export { useEditsAvailable } from '~/lib/plugin';

export interface MakerWord {
  text: string;
  /** Milliseconds into the song. */
  start?: number;
  end?: number;
}

export interface MakerLine {
  text: string;
  start?: number;
  end?: number;
  /** Word mode: the line's words, each tapped. */
  words?: MakerWord[];
  /** A pause (a blank line): tapping it ends the line before. */
  break?: true;
}

export interface Draft {
  itemId: string;
  mode: 'line' | 'word';
  lines: MakerLine[];
}

export interface Target {
  line: number;
  word?: number;
  /** The final tap: ends the last line. */
  end?: true;
}

const words = (text: string): MakerWord[] => text.split(/\s+/).filter(Boolean).map((t) => ({ text: t }));

/** A new draft from pasted text: one line each, blank lines as pauses (runs of them as one). */
export function draftFromText(itemId: string, text: string, mode: Draft['mode']): Draft {
  const lines: MakerLine[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const t = raw.trim();
    if (!t) {
      if (lines.length && !lines[lines.length - 1].break) lines.push({ text: '', break: true });
    } else lines.push(mode === 'word' ? { text: t, words: words(t) } : { text: t });
  }
  while (lines.length && lines[lines.length - 1].break) lines.pop();
  return { itemId, mode, lines };
}

/** A draft from lyrics the song already has, timings kept (to fix or redo them). */
export function draftFromLyrics(itemId: string, lyrics: LyricLine[]): Draft {
  const mode = lyrics.some((l) => l.words?.length) ? 'word' : 'line';
  const lines: MakerLine[] = [];
  lyrics.forEach((l, i) => {
    // A gap of over 3 seconds after the line before: a pause, so the line before ends on time.
    const prev = lyrics[i - 1];
    if (prev && l.startMs - prev.endMs > 3000 && lines.length) lines.push({ text: '', break: true });
    lines.push({
      text: l.text,
      start: l.startMs,
      end: l.endMs,
      words: mode === 'word' ? (l.words?.length ? l.words.map((w) => ({ text: w.text, start: w.startMs, end: w.endMs })) : words(l.text)) : undefined,
    });
  });
  return { itemId, mode, lines };
}

const units = (l: MakerLine) => (l.words?.length ? l.words.length : 1);
const unitStart = (l: MakerLine, w: number) => (l.words?.length ? l.words[w]?.start : l.start);

/** What the next tap marks, or null when everything is timed. */
export function nextTarget(d: Draft): Target | null {
  for (let i = 0; i < d.lines.length; i++) {
    const l = d.lines[i];
    if (l.break) {
      if (l.start === undefined) return { line: i };
      continue;
    }
    for (let w = 0; w < units(l); w++) if (unitStart(l, w) === undefined) return l.words?.length ? { line: i, word: w } : { line: i };
  }
  const last = lastSung(d);
  if (last !== null && d.lines[last].end === undefined) return { line: last, end: true };
  return null;
}

function lastSung(d: Draft): number | null {
  for (let i = d.lines.length - 1; i >= 0; i--) if (!d.lines[i].break) return i;
  return null;
}

const copy = (d: Draft): Draft => ({ ...d, lines: d.lines.map((l) => ({ ...l, words: l.words?.map((w) => ({ ...w })) })) });

/** The line and word timed just before (line, word), to end it. */
function previous(d: Draft, line: number, word?: number): { line: number; word?: number } | null {
  const l = d.lines[line];
  if (word && l.words) return { line, word: word - 1 };
  for (let i = line - 1; i >= 0; i--) {
    const p = d.lines[i];
    if (p.break) return null; // A pause already ended it.
    return p.words?.length ? { line: i, word: p.words.length - 1 } : { line: i };
  }
  return null;
}

/** Marks the next line or word at `ms` (and ends the one before there). */
export function tap(d: Draft, ms: number): Draft {
  const t = nextTarget(d);
  if (!t) return d;
  const out = copy(d);
  const at = Math.max(0, Math.round(ms));
  const l = out.lines[t.line];
  if (t.end) {
    const w = l.words?.[l.words.length - 1];
    if (w) w.end = Math.max(at, (w.start ?? 0) + 1);
    l.end = Math.max(at, (l.start ?? 0) + 1);
    return out;
  }
  if (l.break) {
    l.start = at;
  } else if (t.word !== undefined && l.words) {
    l.words[t.word].start = at;
    if (t.word === 0) l.start = at;
  } else l.start = at;
  // The one before ends here.
  const p = previous(out, t.line, t.word);
  if (p) {
    const pl = out.lines[p.line];
    if (p.word !== undefined && pl.words) pl.words[p.word].end ??= at;
    if (p.line !== t.line || p.word === undefined) pl.end ??= at;
    if (p.line !== t.line && pl.words?.length) pl.words[pl.words.length - 1].end ??= at;
  }
  // A pause ends the line before it.
  if (l.break) {
    for (let i = t.line - 1; i >= 0; i--) {
      const pl = out.lines[i];
      if (pl.break) break;
      pl.end ??= at;
      if (pl.words?.length) pl.words[pl.words.length - 1].end ??= at;
      break;
    }
  }
  return out;
}

/** Takes back the last tap. */
export function untap(d: Draft): Draft {
  const out = copy(d);
  const t = nextTarget(d);
  // The unit tapped last: just before the next target (or the last one, when all are done).
  type Unit = { line: number; word?: number; end?: true };
  const all: Unit[] = [];
  out.lines.forEach((l, i) => {
    if (l.break) all.push({ line: i });
    else if (l.words?.length) l.words.forEach((_, w) => all.push({ line: i, word: w }));
    else all.push({ line: i });
  });
  const last = lastSung(out);
  if (last !== null) all.push({ line: last, end: true });
  const idx = t ? all.findIndex((u) => u.line === t.line && u.word === t.word && u.end === t.end) : all.length;
  const u = all[idx - 1];
  if (!u) return d;
  const l = out.lines[u.line];
  if (u.end) {
    l.end = undefined;
    const w = l.words?.[l.words.length - 1];
    if (w) w.end = undefined;
    return out;
  }
  if (u.word !== undefined && l.words) {
    l.words[u.word].start = undefined;
    if (u.word === 0) l.start = undefined;
  } else l.start = undefined;
  // The one before ends open again.
  const p = all[idx - 2];
  if (p && !p.end) {
    const pl = out.lines[p.line];
    if (p.word !== undefined && pl.words) pl.words[p.word].end = undefined;
    if (p.line !== u.line) pl.end = undefined;
    if (p.line !== u.line && pl.words?.length) pl.words[pl.words.length - 1].end = undefined;
  }
  if (l.break) {
    for (let i = u.line - 1; i >= 0; i--) {
      if (!out.lines[i].break) {
        out.lines[i].end = undefined;
        const w = out.lines[i].words;
        if (w?.length) w[w.length - 1].end = undefined;
      }
      break;
    }
  }
  return out;
}

/** Moves one line (and its words) earlier or later. */
export function shiftLine(d: Draft, i: number, deltaMs: number): Draft {
  const out = copy(d);
  const l = out.lines[i];
  if (!l) return d;
  const move = (v: number | undefined) => (v === undefined ? v : Math.max(0, Math.round(v + deltaMs)));
  l.start = move(l.start);
  l.end = move(l.end);
  l.words?.forEach((w) => {
    w.start = move(w.start);
    w.end = move(w.end);
  });
  return out;
}

/** The same words with no timings, to tap them again from the start. */
export function clearTimings(d: Draft): Draft {
  return { ...d, lines: d.lines.map((l) => ({ text: l.text, ...(l.break ? { break: true as const } : {}), ...(l.words ? { words: l.words.map((w) => ({ text: w.text })) } : {}) })) };
}

/** Every line and word timed. */
export const isComplete = (d: Draft) => d.lines.some((l) => !l.break) && nextTarget(d) === null;

// ---- Kept while you work ----

const draftKey = (itemId: string) => `rakki.lyricsDraft.${itemId}`;

/** The draft you were working on for this song, or null. */
export function loadDraft(itemId: string): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(itemId)) ?? 'null') as Draft | null;
    return d?.lines ? d : null;
  } catch {
    return null;
  }
}

export function saveDraftLocal(d: Draft) {
  try {
    localStorage.setItem(draftKey(d.itemId), JSON.stringify(d));
  } catch {
    // Storage full: the draft lasts until Rakki closes.
  }
}

export function clearDraftLocal(itemId: string) {
  try {
    localStorage.removeItem(draftKey(itemId));
  } catch {
    // Nothing kept.
  }
}

// ---- TTML ----

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 83456 → "1:23.456". */
function clock(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

/** The draft as TTML (Apple's flavour, as Spicy Lyrics reads it): word timing in word mode. */
export function toTtml(d: Draft, meta: { title?: string; artist?: string } = {}): string {
  const sung = d.lines.filter((l) => !l.break && l.start !== undefined);
  const wordMode = d.mode === 'word' && sung.some((l) => l.words?.length);
  const endOf = (l: MakerLine, i: number) => l.end ?? sung[i + 1]?.start ?? (l.start ?? 0) + 4000;
  const body = sung
    .map((l, i) => {
      const start = l.start ?? 0;
      const end = Math.max(endOf(l, i), start + 1);
      const begin = `begin="${clock(start)}" end="${clock(end)}"`;
      if (!wordMode || !l.words?.length) return `      <p ${begin} ttm:agent="v1">${esc(l.text)}</p>`;
      const ws = l.words.map((w, k) => {
        const ws0 = w.start ?? start;
        const we = Math.max(w.end ?? l.words?.[k + 1]?.start ?? end, ws0 + 1);
        return `<span begin="${clock(ws0)}" end="${clock(we)}">${esc(w.text)}</span>`;
      });
      return `      <p ${begin} ttm:agent="v1">${ws.join(' ')}</p>`;
    })
    .join('\n');
  const last = sung.length ? endOf(sung[sung.length - 1], sung.length - 1) : 0;
  const title = meta.title ? `\n      <ttm:title>${esc(meta.title)}</ttm:title>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" itunes:timing="${wordMode ? 'Word' : 'Line'}" xml:lang="en">
  <head>
    <metadata>${title}
      <ttm:agent type="person" xml:id="v1"/>
    </metadata>
  </head>
  <body dur="${clock(last)}">
    <div begin="${clock(sung[0]?.start ?? 0)}" end="${clock(last)}">
${body}
    </div>
  </body>
</tt>
`;
}

// ---- On the server ----

async function ready(): Promise<void> {
  if (!versionAtLeast(await pluginVersion(), '0.3')) throw new PluginError('Saving lyrics needs the Rakki plugin 0.3 on the server.');
}

/** Saves the lyrics on the server; every Rakki shows them from then on. The local draft goes. */
export async function saveMadeLyrics(item: BaseItem, d: Draft): Promise<void> {
  await ready();
  const ttml = toTtml(d, { title: item.Name, artist: item.Artists?.join(', ') });
  await pluginRequest('PUT', `/Rakki/Lyrics/${item.Id}`, ttml, 'application/xml');
  clearDraftLocal(item.Id);
  await queryClient.invalidateQueries({ queryKey: ['lyrics'] });
}

/** Removes the lyrics you made for the song (it goes back to its other lyrics, if any). */
export async function removeMadeLyrics(itemId: string): Promise<void> {
  await ready();
  await pluginRequest('DELETE', `/Rakki/Lyrics/${itemId}`);
  await queryClient.invalidateQueries({ queryKey: ['lyrics'] });
}

/** Whether the song has lyrics made in Rakki (to offer Remove). */
export async function hasMadeLyrics(itemId: string): Promise<boolean> {
  if (!versionAtLeast(await pluginVersion(), '0.3')) return false;
  const r = await pluginRequest<{ Made: boolean }>('GET', `/Rakki/Lyrics/${itemId}/Made`).catch(() => null);
  return !!r?.Made;
}
