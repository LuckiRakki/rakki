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
