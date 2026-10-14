// Settings → Look applied to the whole app: its size (the webview's own zoom, so everything
// scales together, as with Ctrl and + in a browser), typeface, corners, spacing and motion (as
// attributes on <html> the styles follow), and the lyrics' size.
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useEffect } from 'react';

import { inTauri } from '~/lib/tauri';
import { useLook } from '~/settings/look';

export function useApplyLook() {
  const app = useLook((s) => s.app);
  const lyricsSize = useLook((s) => s.lyricsSize);

  useEffect(() => {
    if (inTauri) void getCurrentWebview().setZoom(app.size).catch(() => {});
    // A plain browser tab (development): CSS zoom does the same.
    else document.documentElement.style.setProperty('zoom', String(app.size));
  }, [app.size]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.font = app.font;
    root.dataset.corners = app.corners;
    root.dataset.density = app.density;
    root.toggleAttribute('data-reduce-motion', app.reduceMotion);
  }, [app.font, app.corners, app.density, app.reduceMotion]);

  useEffect(() => document.documentElement.style.setProperty('--lyrics-size', String(lyricsSize)), [lyricsSize]);
}
