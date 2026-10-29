// Loading in order (phone and desktop share it). A page is a list of parts, top to bottom: the
// header, a shelf, the songs. While a part loads, a placeholder of its size holds its place
// (the placeholders fade in one after another), and parts appear strictly top to bottom, a beat
// apart, so nothing on screen gets pushed around. Pictures then fade in inside what's there.
//
// What a part can be:
// - 'loading': still loading; a placeholder of its size holds its place.
// - 'waiting': still loading, and it may well turn out empty (Singles and EPs, Fans Also Like),
//   so it holds no place: nothing under it shows until it's settled, then it joins the bottom.
// - 'ready': has something to show.
// - 'empty': nothing to show (or it failed): left out.
import { useEffect, useState } from 'react';

export type Part = 'loading' | 'waiting' | 'ready' | 'empty';

export interface Step {
  /** Draw the placeholder, the part itself, or nothing (yet). */
  show: 'placeholder' | 'content' | 'none';
  /** ms before it fades in: a placeholder's turn down the page, or a part's beat after the one above. */
  delay: number;
  /** Fade in at all: not for what was already loaded when the page opened (it's simply there). */
  animate: boolean;
}

/** Between one part appearing and the next. */
export const BEAT_MS = 70;
/** Placeholders wait this long (a quick answer never flashes them), then fade in a beat apart. */
const PLACEHOLDER_MS = 140;
const PLACEHOLDER_BEAT_MS = 55;
/**
 * A slow part holds back the parts under it only this long; then they show (its placeholder
 * still keeps its place, so nothing moves when it arrives).
 */
const PATIENCE_MS = 900;
/** A 'waiting' part (no placeholder) holds things back this long at most; if it comes later, it joins then. */
const LONG_PATIENCE_MS = 2600;

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** When a placeholder fades in: one after another down the page. */
export const placeholderDelay = (i: number) => PLACEHOLDER_MS + Math.min(i, 10) * PLACEHOLDER_BEAT_MS;

/**
 * A query's answer as a Part: still loading (`reserve`: holding its place; false: 'waiting'),
 * empty or failed, or ready. Lists are empty when they have no items.
 */
export function partOf(data: unknown, { failed = false, reserve = true }: { failed?: boolean; reserve?: boolean } = {}): Part {
  if (data === undefined) return failed ? 'empty' : reserve ? 'loading' : 'waiting';
  if (data === null) return 'empty';
  return Array.isArray(data) && !data.length ? 'empty' : 'ready';
}

/** A query that won't answer: it failed, or it isn't asking (offline, or switched off). Its part is empty. */
export const gaveUp = (q: { isError: boolean; isLoading: boolean; data?: unknown }) => q.isError || (q.data === undefined && !q.isLoading);

interface Shown {
  /** Each part's fade-in delay, fixed when it first appeared (undefined: not yet). */
  delays: (number | undefined)[];
  animated: boolean[];
  /** When (clock) the latest part fades in. */
  lastAt: number;
}

type Patience = 0 | 1 | 2;

/** Walk down the page: a part shows once everything above it has settled (or patience ran out). */
function plan(parts: readonly Part[], shown: Shown, patience: Patience): Step['show'][] {
  let blocked = false; // something above hasn't appeared yet
  let hidden = false; // something above holds no place yet: nothing under it may hold one either
  return parts.map((p, i) => {
    if (p === 'empty') return 'none';
    if (p === 'ready') {
      if (shown.delays[i] !== undefined || (!blocked && !hidden)) return 'content';
      blocked = true; // held back: the parts under it wait their turn too
      return hidden ? 'none' : 'placeholder';
    }
    if (p === 'waiting') {
      if (patience < 2) blocked = hidden = true;
      return 'none';
    }
    if (patience < 1) blocked = true;
    return hidden ? 'none' : 'placeholder';
  });
}

/** What each of the page's parts draws now (`parts` top to bottom). */
export function useReveal(parts: readonly Part[]): Step[] {
  const [patience, setPatience] = useState<Patience>(0);
  // What was loaded when the page opened is simply there.
  const [shown, setShown] = useState<Shown>(() => {
    const first = plan(parts, { delays: [], animated: [], lastAt: 0 }, 0);
    return { delays: first.map((s) => (s === 'content' ? 0 : undefined)), animated: first.map(() => false), lastAt: 0 };
  });
  const unsettled = parts.some((p) => p === 'loading' || p === 'waiting');

  useEffect(() => {
    if (!unsettled || patience === 2) return;
    const id = setTimeout(() => setPatience(patience === 0 ? 1 : 2), patience === 0 ? PATIENCE_MS : LONG_PATIENCE_MS - PATIENCE_MS);
    return () => clearTimeout(id);
  }, [unsettled, patience]);

  const want = plan(parts, shown, patience);
  // Parts appearing now get their beat, one after another, after whatever appeared last.
  const fresh = want.flatMap((w, i) => (w === 'content' && shown.delays[i] === undefined ? [i] : []));
  let next = shown;
  if (fresh.length) {
    const now = clock();
    let at = Math.max(now, shown.lastAt + BEAT_MS);
    const delays = [...shown.delays];
    const animated = [...shown.animated];
    for (const i of fresh) {
      delays[i] = Math.round(at - now);
      animated[i] = true;
      at += BEAT_MS;
    }
    next = { delays, animated, lastAt: at - BEAT_MS };
    setShown(next);
  }

  return want.map((show, i) => ({
    show,
    delay: show === 'content' ? (next.delays[i] ?? 0) : placeholderDelay(i),
    animate: show === 'content' ? !!next.animated[i] : true,
  }));
}
