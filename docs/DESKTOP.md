# Rakki desktop (Windows and Linux)

The user's goal (2026-10-12): everything the phone app does, with its clean look, as a desktop
app light enough to leave running in the background while gaming or on a laptop. Feishin is the
reference for how a desktop music app lays things out (its source is at Downloads\feishin-spicy).

Built with Tauri 2 (the system webview) and mpv in its own process; see desktop/README.md for
the architecture. The interface shares the phone app's TypeScript wherever it's plain code.

## What's shared with the phone app

`@/x` imports resolve to `desktop/src/overrides/x` first, then to the phone app's `src/x`.

| Shared as is | Desktop stand-in (overrides/) |
|---|---|
| api/jellyfin (the client), lyrics types, lib/mixes, lib/format, lib/color, lib/blurhash, lib/prefs (localStorage), lib/lastfm, settings/store, search/fuzzy + index, player/smartQueue, appearance presets | lib/online, lib/updates, auth/store (the desktop session), expo-device |

## Layout (after Feishin, in Rakki's look)

- **Title bar** (the window is borderless): back/forward, search, window buttons. Draggable.
  Same on the sign-in screen.
- **Sidebar**: Home, Search; Library (Playlists, Mixes, Albums, Songs, Artists, Genres, Radio,
  Videos); Liked Songs and your playlists. Collapsible.
- **Main**: pages with a **library header** (artwork, type, title, details, over the item's
  colour) and an **action bar** (play, shuffle, like, more, then find/sort/view on the right).
- **Queue / Lyrics panel** on the right (toggle).
- **Player bar**: artwork (opens Now Playing), title, artists, like; controls and seek; lyrics,
  queue, sleep timer, volume (scroll to change).
- **Now Playing** (full window): blurred artwork backdrop, big artwork, tabs Up next / Lyrics /
  Related; controls fade in on mouse move.
- **Right-click menus** on every song, album, artist, playlist and queue entry.

## Feature checklist

Phone app features, and where the desktop is.

### Wave 1: the frame and the essentials
- [ ] Sign-in screen with a real title bar (drag, window buttons) and the phone's look.
- [ ] Design system: accent (custom or Lucid), fonts, buttons, chips, menus, tooltips, toasts.
- [ ] Library header + action bar on album, artist, playlist, genre, Liked Songs.
- [ ] Song table: number/play on hover, title + artists, album, plays, length, like; double-click
      plays; right-click menu; Shift/Ctrl selection.
- [ ] Right-click menus: Play, Play next, Add to queue, Add to playlist, Like, Go to album,
      Go to artist, Song/Album/Artist radio, Remove from playlist/queue, Rename/Delete playlist.
- [ ] Add to playlist dialog (marks where a song already is, New playlist).
- [ ] Player bar: like, lyrics, queue, sleep timer, volume with scroll, artwork opens Now Playing.
- [ ] Now Playing view with Up next / Lyrics / Related.
- [ ] Regular lyrics (line by line, synced).

### Wave 2: library and pages
- [ ] Library tabs with sort, grid/list and find: Playlists, Mixes, Albums, Songs, Artists,
      Genres.
- [ ] Album page: Last.fm plays per song, total length, other albums by the artist.
- [ ] Artist page: Popular (Last.fm or yours), Discography, Singles and EPs, Music videos,
      Appears on, Fans also like.
- [ ] Genre page; Playlist page with sort, find, reorder, remove, rename, cover.
- [ ] Home like the phone's: quick picks, shelves, reorder and hide.

### Wave 3: the rest of the phone app
- [ ] Spicy lyrics (port of the web mod's renderer), lyrics style, offset.
- [ ] Search: on-device fuzzy index, lyrics search, filters, recent searches, Browse all.
- [ ] Smart queue / autoplay, song and artist radio (shared smartQueue).
- [ ] Settings: accounts, appearance (accent, Lucid, fonts, size, density), playback (quality,
      normalization, autoplay, gapless), Last.fm, about.
- [ ] Music videos (mpv can show video), internet radio and SUB/WAVE.
- [ ] Liked songs and playlist cache (the heart for "in a playlist").

### Wave 4: desktop extras
- [ ] Hidden to the tray: WebView2 low-memory mode; nothing redraws.
- [ ] Discord presence; mini player; keyboard shortcuts; start with the computer.
- [ ] Packaging: Windows installer with mpv bundled, Linux AppImage/.deb; GitHub Actions builds;
      auto-update.
