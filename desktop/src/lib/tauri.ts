// Whether this is running inside the app (Tauri) or a plain browser tab (testing the interface
// with `npm run dev`): native calls (mpv, window buttons, media controls) only happen in the app.
export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
