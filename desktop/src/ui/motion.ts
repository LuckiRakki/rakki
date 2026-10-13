// Motion helpers. Everything moves with transforms and opacity only (the compositor does the
// work, nothing re-lays out), and only while something changes; styles.css has the curves.
import { useEffect, useState } from 'react';

/**
 * Keep something on screen a moment after it's closed so it can animate away: `render` is
 * whether to draw it, `leaving` is true during its exit (add a class that plays it).
 */
export function usePresence(open: boolean, exitMs = 240): { render: boolean; leaving: boolean } {
  const [render, setRender] = useState(open);
  useEffect(() => {
    if (open) return setRender(true);
    if (!render) return;
    const t = setTimeout(() => setRender(false), exitMs);
    return () => clearTimeout(t);
  }, [open, render, exitMs]);
  return { render: open || render, leaving: !open && render };
}
