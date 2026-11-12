// Small helpers the Sync Lyrics steps share: times as text, which lines are tapped, the playing time.
import type { Draft, MakerLine } from '~/lyrics/maker';
import { currentPosition, usePlayer } from '~/player/store';

export type Step = 'text' | 'tap' | 'check';

/** 83456 → "1:23.45" */
export function stamp(ms: number | undefined): string {
  if (ms === undefined) return '–:––.––';
  const cs = Math.max(0, Math.round(ms / 10));
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

export const sung = (d: Draft) => d.lines.filter((l) => !l.break);

export const tapped = (l: MakerLine) => l.start !== undefined;

/** Every word (or the line itself) has its time. */
export const timed = (l: MakerLine) => (l.words?.length ? l.words.every((w) => w.start !== undefined) : l.start !== undefined);

export const anyTapped = (d: Draft) => d.lines.some((l) => tapped(l) || l.words?.some((w) => w.start !== undefined));

/** The text of a draft, back as rows (breaks as empty rows). */
export const textOf = (d: Draft) => d.lines.map((l) => (l.break ? '' : l.text)).join('\n');

/** The latest time tapped anywhere in the draft (ms), or 0. */
export function lastTap(d: Draft): number {
  let at = 0;
  for (const l of d.lines) {
    for (const t of [l.start, l.end, ...(l.words ?? []).flatMap((w) => [w.start, w.end])]) if (t !== undefined && t > at) at = t;
  }
  return at;
}

export const nowMs = () => Math.round(currentPosition(usePlayer.getState()) * 1000);
