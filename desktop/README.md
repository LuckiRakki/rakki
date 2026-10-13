# Rakki for Windows and Linux

Rakki's desktop app: Jellyfin music with synced lyrics, light enough to leave running in the
background (while gaming, on a laptop). What it does so far: docs/DESKTOP.md.

- **Window:** [Tauri](https://tauri.app) (the system's own webview: WebView2 on Windows,
  WebKitGTK on Linux), not a bundled browser. The interface is React + TypeScript and shares the
  phone app's code (`../src`: the Jellyfin client, lyrics, Daily Mix helpers); `@/` imports
  resolve to `src/overrides` first (desktop stand-ins), then to the phone app.
- **Playback:** [mpv](https://mpv.io) in its own process, driven over its JSON IPC
  (`src-tauri/src/mpv.rs`), holding the current song and the next (gapless). Music keeps
  playing with the window closed to the tray and the interface asleep.
- **System controls:** media keys, Windows' media overlay and Linux's MPRIS
  (`src-tauri/src/media.rs`, souvlaki), and a tray menu.
- **Out of sight** (tray or minimized): the page sleeps and WebView2 stops rendering and keeps
  its memory low (`src-tauri/src/memory.rs`).
- **Music videos** play in the window (`src/player/VideoHost.tsx`, one video element moved
  between the sidebar, theater and full screen): straight from the file
  when the webview can, else converted by the server over HLS (hls.js).
- **Discord** "Listening to" through the Discord app's local IPC (`src-tauri/src/discord.rs`).

## Run it

Needs Node, Rust and mpv (Windows: `winget install shinchiro.mpv`; Linux: your distro's `mpv`).

```bash
npm install
npm run tauri dev
```

`RAKKI_MPV` points at a specific mpv binary if it isn't on the PATH.

## Installers

`.github/workflows/desktop.yml` builds them on GitHub: a Windows installer with mpv inside, and
a Linux AppImage and .deb (both use the system's mpv; the .deb installs it). Run the workflow by
hand for test builds, or push a `desktop-vX.Y.Z` tag for a draft release. Rakki checks for a
newer `desktop-v*` release and shows an Update button.
