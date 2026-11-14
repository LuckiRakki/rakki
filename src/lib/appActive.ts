// Whether Rakki is on screen. Every drawing loop (requestAnimationFrame) must stop when it
// isn't: in the background React Native runs requestAnimationFrame as setTimeout(0), with no
// frame pacing, so a frame loop becomes a busy loop, and iOS kills an app that keeps the CPU
// busy in the background for about a minute (that's what stopped the music when locked).
import { useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

function subscribe(onChange: () => void) {
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}

const isActive = () => AppState.currentState === 'active';

/** True while the app is in the foreground. */
export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, isActive, () => true);
}

const isBackground = () => AppState.currentState === 'background';

/**
 * True the moment Rakki goes to the background. For drawing loops and other CPU work, which must
 * stop at once (see the top of this file). Memory is let go later: see useInBackground.
 */
export function useBackgroundNow(): boolean {
  return useSyncExternalStore(subscribe, isBackground, () => false);
}

/** How long Rakki stays in the background before the heavy parts let go (Lucki: about 3 minutes). */
export const LET_GO_AFTER_MS = 3 * 60_000;

let awayLong = false;
let awayTimer: ReturnType<typeof setTimeout> | null = null;
const awayListeners = new Set<() => void>();

function setAwayLong(next: boolean) {
  if (awayLong === next) return;
  awayLong = next;
  for (const l of awayListeners) l();
}

/** Lets go now (iOS said memory is low while Rakki was in the background). */
export function letGoNow() {
  if (AppState.currentState === 'background') setAwayLong(true);
}

let watching = false;
function watchAway() {
  if (watching) return;
  watching = true;
  AppState.addEventListener('change', (state) => {
    if (awayTimer) clearTimeout(awayTimer);
    awayTimer = null;
    if (state === 'background') {
      // When iOS suspends Rakki (nothing playing) the timer waits too, so check on firing.
      awayTimer = setTimeout(() => {
        awayTimer = null;
        if (AppState.currentState === 'background') setAwayLong(true);
      }, LET_GO_AFTER_MS);
    } else if (state === 'active') {
      setAwayLong(false);
    }
  });
}

function subscribeAway(onChange: () => void) {
  watchAway();
  awayListeners.add(onChange);
  return () => {
    awayListeners.delete(onChange);
  };
}

const isAwayLong = () => awayLong;

/** Calls `fn` each time Rakki has been in the background long enough to let go of memory. */
export function onLetGo(fn: () => void): () => void {
  return subscribeAway(() => {
    if (awayLong) fn();
  });
}

/**
 * True once Rakki has been in the background for about 3 minutes (or sooner if iOS says memory
 * is low), not on a quick trip to another app. Heavy parts (pictures, the moving backgrounds,
 * the lyrics drawing) let go of their memory then and come back when it returns, so iOS has
 * less reason to close Rakki; the screens themselves (and where you were on them) stay.
 */
export function useInBackground(): boolean {
  return useSyncExternalStore(subscribeAway, isAwayLong, () => false);
}

/**
 * `value`, held at what it was when Rakki went to the background until it comes back. For
 * screens that redo a lot of work on every change: nobody sees them in the background, and
 * the queue screen, re-laying out its whole list at each song change there, grew by about
 * 24 MB a song (perf log 10-27). Back on screen it catches up at once.
 */
export function useHeldWhileAway<T>(value: T): T {
  const away = useBackgroundNow();
  const [held, setHeld] = useState<{ value: T } | null>(null);
  if (away && !held) setHeld({ value });
  if (!away && held) setHeld(null);
  return held ? held.value : value;
}
