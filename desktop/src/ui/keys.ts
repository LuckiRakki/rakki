// Keyboard helpers for things that act like buttons without being <button>s (cards, rows).
import type { KeyboardEvent } from 'react';

/** Enter or Space runs `run`, as a button would. */
export function activateOnKey(run: () => void) {
  return (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      run();
    }
  };
}
