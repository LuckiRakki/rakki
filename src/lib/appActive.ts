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
 * True while Rakki is in the background (not just covered by Control Center or the app
 * switcher for a moment). Heavy parts (pictures, the moving backgrounds, the lyrics drawing)
 * let go of their memory then and come back when it returns, so iOS has less reason to close
 * Rakki; the screens themselves (and where you were on them) stay.
 */
export function useInBackground(): boolean {
  return useSyncExternalStore(subscribe, isBackground, () => false);
}

/**
 * `value`, held at what it was when Rakki went to the background until it comes back. For
 * screens that redo a lot of work on every change: nobody sees them in the background, and
 * the queue screen, re-laying out its whole list at each song change there, grew by about
 * 24 MB a song (perf log 10-27). Back on screen it catches up at once.
 */
export function useHeldWhileAway<T>(value: T): T {
  const away = useInBackground();
  const [held, setHeld] = useState<{ value: T } | null>(null);
  if (away && !held) setHeld({ value });
  if (!away && held) setHeld(null);
  return held ? held.value : value;
}
