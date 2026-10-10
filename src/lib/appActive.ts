// Whether Rakki is on screen. Every drawing loop (requestAnimationFrame) must stop when it
// isn't: in the background React Native runs requestAnimationFrame as setTimeout(0), with no
// frame pacing, so a frame loop becomes a busy loop, and iOS kills an app that keeps the CPU
// busy in the background for about a minute (that's what stopped the music when locked).
import { useSyncExternalStore } from 'react';
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
