# Rakki for Windows and Linux

Rakki's desktop app: Jellyfin music with word-by-word lyrics, light enough to leave running in
the background (while gaming, on a laptop).

- **Window:** [Tauri](https://tauri.app) (the system's own webview: WebView2 on Windows,
  WebKitGTK on Linux), not a bundled browser. The interface is React + TypeScript and shares the
  phone app's code (`../src`: the Jellyfin client, lyrics, Daily Mix helpers); `@/` imports
  resolve to `src/overrides` first (desktop stand-ins), then to the phone app.
- **Playback:** [mpv](https://mpv.io) in its own process, driven over its JSON IPC
  (`src-tauri/src/mpv.rs`), holding the current song and the next (gapless). Music keeps
  playing with the window closed to the tray and the interface asleep.
- **System controls:** media keys, Windows' media overlay and Linux's MPRIS
  (`src-tauri/src/media.rs`, souvlaki), and a tray menu.

## Run it

Needs Node, Rust and mpv (Windows: `winget install shinchiro.mpv`; Linux: your distro's `mpv`).

```bash
npm install
npm run tauri dev
```

`RAKKI_MPV` points at a specific mpv binary if it isn't on the PATH.
