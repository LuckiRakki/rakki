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
  Videos); Liked Songs and your playlists. Drag its edge to resize (double-click resets).
- **Main**: pages with a **library header** (artwork, type, title, details, over the item's
  colour) and an **action bar** (play, shuffle, like, more, then find/sort/view on the right).
- **Right sidebar** (Spotify's Now Playing view): artwork, song, a lyrics card following the
  song (click for the full player's lyrics), About the artist, Credits (artists, writers,
  producers; album, year, genre, format), Next in queue; or the whole queue. Resizable.
- **Player bar**: artwork (opens Now Playing), title, artists, like; controls and seek; lyrics,
  queue, sleep timer, volume (scroll to change).
- **Full player** (after Feishin's): over everything but the player bar, which stays; blurred
  artwork behind; big artwork with title, artists, album and badges; queue table / related /
  big fading lyrics, picked with icons bottom right; a button to fill the screen.
- **Lyrics** (the player bar's Lyrics button): big lyrics in the main area over the flowing
  cover, sidebars kept (lyrics/LyricsMain.tsx).
- **Themes**: .css files imported in Settings → Look → Theme (docs/THEMES.md, themes/).
- **Right-click menus** on every song, album, artist, playlist and queue entry.
- **Edit Audio** (a song's menu): its start and end on a waveform, fades, volume, a ten-band
  equalizer, speed, pitch and reverb, kept by the Rakki plugin apart from the file
  (audio/AudioEditor.tsx, audio/edits.ts).
- **Sync Lyrics** (a song's menu, or a song with no lyrics): tap along to make timed lyrics,
  line by line or word by word, kept by the Rakki plugin (lyrics/LyricsMaker.tsx, lyrics/maker.ts).
- **Edit Artist** (an artist's menu): name (written into the songs by MRQ), sort name, genres,
  biography and pictures (photo, header, logo, banner; a file or one found online)
  (mrq/EditArtist.tsx, mrq/artist.ts).
- **Lyrics source** (Lyrics Settings): which lyrics a song shows when it has more than one,
  kept by the Rakki plugin for every Rakki (lyrics/source.ts, shared with the phone).

## Feature checklist

[x] done, [~] partly (see notes), [ ] not yet.

Phone app features, and where the desktop is.

### Wave 1: the frame and the essentials
- [x] Sign-in screen with a real title bar (drag, window buttons) and the phone's look.
- [~] Design system: accent (custom or Lucid), fonts, buttons, chips, menus, tooltips, toasts.
- [x] Library header + action bar on album, artist, playlist, genre, Liked Songs.
- [x] Song table: number/play on hover, title + artists, album, plays, length, like; double-click
      plays; right-click menu; Shift/Ctrl selection.
- [x] Right-click menus: Play, Play next, Add to queue, Add to playlist, Like, Go to album,
      Go to artist, Song/Album/Artist radio, Remove from playlist/queue, Rename/Delete playlist.
- [x] Add to playlist dialog (marks where a song already is, New playlist).
- [x] Player bar: like, lyrics, queue, sleep timer, volume with scroll, artwork opens Now Playing.
- [x] Right sidebar like Spotify's Now Playing view (lyrics card, about, credits, next up) and
      the queue; both sidebars resizable.
- [x] Full player like Feishin's: queue table, related, big lyrics; player bar stays.
- [x] Regular lyrics (line by line, synced).

### Wave 2: library and pages
- [x] Library tabs with sort, grid/list and find: Playlists, Mixes, Albums, Songs, Artists,
      Genres.
- [x] Album page: Last.fm plays per song, total length, other albums by the artist.
- [x] Artist page: Popular (Last.fm or yours), Discography, Singles and EPs, Music videos,
      Appears on, Fans also like.
- [x] Genre page; Playlist page with sort, find, drag to reorder, remove, rename, cover picture.
- [x] Home: quick picks and shelves; Customize reorders and hides sections.

### Wave 3: the rest of the phone app
- [x] Spicy lyrics (the web mod's engine) in the full player, with the Spicy / Regular style.
- [x] Lyrics timing (offset) per song, shared with the phone; Save to server. Spicy in the sidebar card too.
- [x] Search: on-device fuzzy index (shared with the phone), lyrics search, filters, recent
      searches, Browse all.
- [x] Smart queue / autoplay, song and artist radio (shared smartQueue).
- [x] Settings: accounts, appearance (accent, Lucid, fonts, size, density), playback (quality,
      normalization, autoplay, gapless), Last.fm, about.
- [x] Music videos (Library, Videos) in Rakki's own player, in three sizes: mini (right sidebar),
      theater (the phone's video screen: info, album, a visualizer graph, Up next with autoplay)
      and full screen; straight from the file, or converted over HLS; internet
      radio and SUB/WAVE (Library, Radio: add by address; what's on air for SUB/WAVE).
- [x] Playlist cache (shared with the phone): the heart is filled when a song is liked or in any
      playlist; Add to playlist ticks show at once.

### Playing across devices
- [x] Phase 1: the Devices button lists your other Rakki apps and what they play.
- [x] Phases 2 and 3: pick a device to control it from the player bar ("Playing on ..."); Play
      here and Play on {device} move playback, at the same moment. Both apps take commands.
- [x] Phase 4: media keys, the media overlay, the tray (menu and tooltip) and Discord follow the
      device being controlled; the phone has its own Devices screen. See
      [REMOTE_PLAYBACK.md](REMOTE_PLAYBACK.md).

### Wave 4: desktop extras
- [x] App icon (Rakki's, rounded).
- [x] Full screen: F11 or the button in the full player; Esc steps back out.
- [x] Out of sight (tray or minimized): the page sleeps, WebView2 stops rendering and drops to
      its low memory target.
- [x] Mini player: the window shrinks to a small player kept on top (pin), and grows back. It
      takes the theme in use, backdrop included.
- [x] Discord presence ("Listening to Rakki", Rakki's own Discord application; your own ID optional),
      with Listen and Rakki on GitHub buttons.
- [x] Keyboard shortcuts you can change (Settings → Shortcuts; settings/shortcuts.ts).
- [x] Start with the computer (installed app): opens quietly in the tray.
- [x] Packaging: Windows installer with mpv bundled, Linux AppImage/.deb (needs mpv), built by
      .github/workflows/desktop.yml (by hand, or a desktop-v* tag for a draft release).
- [x] Update check: a newer desktop-v* release shows an Update button (opens the download page).
