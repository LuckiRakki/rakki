// "Press Esc to exit full screen", as Chromium shows it when a page goes full screen (Spicy
// Lyrics' Cinema mode gets it from Spotify's browser). Rakki fills the screen with the window
// itself (layout.ts setFullscreen), which shows nothing, so it says so here: at the top for a
// few seconds each time full screen starts, and again when the pointer reaches the top edge.
import { useEffect, useState } from 'react';

import { useLayout } from '~/layout/layout';

const SHOW_MS = 3500;

export function FullscreenHint() {
  const fullscreen = useLayout((s) => s.fullscreen);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!fullscreen) return setShown(false);
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      setShown(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShown(false), SHOW_MS);
    };
    show();
    // At the very top of the screen, it shows again (where the browser's comes back too).
    let atTop = false;
    const move = (e: MouseEvent) => {
      const top = e.clientY <= 2;
      if (top && !atTop) show();
      atTop = top;
    };
    window.addEventListener('mousemove', move);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', move);
    };
  }, [fullscreen]);

  if (!fullscreen) return null;
  return (
    <div className={`fs-hint${shown ? ' shown' : ''}`} role="status" aria-hidden={!shown}>
      Press <kbd>Esc</kbd> to exit full screen
    </div>
  );
}
