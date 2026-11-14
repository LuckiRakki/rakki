import { useRef } from 'react';
import { Keyboard, Platform, type GestureResponderEvent } from 'react-native';

/** Closes the keyboard if it's up (cheap to call on every drag). Phone only: on desktop it would blur the field. */
export function dismissKeyboard() {
  if (Platform.OS === 'web') return;
  if (Keyboard.isVisible()) Keyboard.dismiss();
}

/**
 * Spread on every list of a screen with a search field: dragging it closes the keyboard (iOS does this
 * natively with on-drag; onScrollBeginDrag makes sure of it), and a tap on a result still works.
 */
export const closeKeyboardOnScroll = {
  keyboardDismissMode: 'on-drag',
  keyboardShouldPersistTaps: 'handled',
  onScrollBeginDrag: dismissKeyboard,
} as const;

/** How far a finger moves (px) before it counts as a swipe; under iOS's scroll start (10 pt). */
const SWIPE = 8;

/**
 * Spread on a search screen's outer View: a vertical swipe anywhere on it closes the keyboard, also
 * over parts that don't scroll (empty states, short lists, the header). Touch events bubble up from
 * every child, so the lists inside need nothing extra.
 */
export function useSwipeClosesKeyboard() {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: GestureResponderEvent) => {
      start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    },
    onTouchMove: (e: GestureResponderEvent) => {
      const from = start.current;
      if (!from) return;
      const dy = Math.abs(e.nativeEvent.pageY - from.y);
      const dx = Math.abs(e.nativeEvent.pageX - from.x);
      if (dy > SWIPE && dy > dx) {
        start.current = null;
        dismissKeyboard();
      }
    },
    onTouchEnd: () => {
      start.current = null;
    },
  };
}
