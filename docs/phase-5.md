# Phase 5: Parity and polish

> **Status: done** (2026-10-01). Kept as the record of what was built.

Goal (FRAMEWORK.md §7): the in-depth customizer, plus the Finamp/Feishin features still
missing, and a feel pass. Everything here is JavaScript (fonts are assets), so it ships over
the air. Native-only items wait for the one final build (the user's call, 2026-10-01).

Already done in earlier phases: the lyrics screen covers the whole screen with an album
header and edge fades (Phase 2, signed off 2026-09-30); instant mix / radio (Phase 3 menu).

## 5a. Customize screen — built 2026-10-01
Settings → Customize (`src/app/customize.tsx`). Every control changes the real app live
(sliders update a few times a second while dragging); a preview card at the top.
- [x] Colour: accent Custom (12 swatches + #RRGGBB) or Lucid; background Dark / OLED / Tinted
  (near-black mixed with the accent); card contrast; album colour strength (`t.tint()` used by
  album/playlist/artist headers, the player gradient and the mini-player).
- [x] Text: Inter, Figtree, Plus Jakarta Sans, DM Sans (5 weights each, imported per weight,
  all loaded at launch); text size; big titles heavy/bold (`t.fonts.display` / `t.fonts.title`).
- [x] Shape: corner roundness, spacing, album grid columns 2/3/4 (Library, Downloaded,
  playlists grid, genre pages; artists get one more column).
- [x] Home: greeting and quick picks on/off; shelves show/hide (eye) and reorder (up/down).
- [x] Mini-player: album colour / solid / glass (BlurView); progress line; tab labels.
- [x] Now playing: gradient / blurred art / solid background; lyrics card on/off.
- [x] Feel: haptics on/off (`src/lib/haptics.ts`); motion follow iOS / reduced / full
  (`t.reduceMotion`: sheets appear instantly, lyrics backdrop stays still).
- [x] Presets: Rakki, Spotify-like (green, Figtree), Apple Music-like (red, OLED, glass, blurred
  art, rounder), OLED black, Big & bold. A preset fills every look setting (not Home/Feel).
- [x] Reset per section and for everything; export (iOS share sheet, JSON text) and import
  (paste) a theme. Storage stays version 1: new keys fall back to defaults.

## 5b. Lyrics tuning — built 2026-10-01
Customize → Lyrics style (also the sliders icon on the lyrics screen): `src/app/lyrics-style.tsx`,
store `src/lyrics/style.ts`. A live preview loops the demo lyrics (`src/lyrics/demo.ts`) over the
playing album, drawn by the real renderers.
- [x] Spicy: glow on/off + strength, word pop, word lift, highlight edge (sweep band), letter by
  letter on/off + letter pop/glow, motion speed and calm (damping), other-line blur on/off +
  amount, line glow on/off, pause dots threshold + bounce; text size, font (Spicy's Inter or the
  app's), alignment left/centre (new in the scene: `lineX`), colour white/accent (new: scene
  colour instead of hard-coded white); background movement (0 = still), blur, darken.
- [x] Regular: text size, alignment, other-line visibility, current-line colour.
- [x] "Lyrics open in" Spicy/Regular. Reset for Spicy and for Regular.
- Note: `SpicySettings`/`SPICY_DEFAULTS` moved to `src/spicy/settings.ts` (no Skia import), since
  importing scene.ts early loads Skia before CanvasKit in the web preview.

## 5c. Parity — built 2026-10-01
- [x] Queue restore (`restoreQueue` in player/store.ts): queue, index, shuffle/repeat, source and
  the pre-shuffle order saved per user (`rakki.queue.<user>`, debounced); position saved every
  10 s while playing and when the app leaves the foreground. Comes back paused; the "started"
  report is held until play is pressed.
- [x] Normalization (Settings → Playback → Even out volume, on by default): gain =
  10^((NormalizationGain + 4)/20) capped at 1 (aim -14 LUFS; 99% of songs have the tag, avg
  -7.5 dB). Toggling re-applies to the playing song via setVolume.
- [x] Sleep timer: player "..." → Sleep timer (5/15/30/45/60 min, end of this song); last 10 s
  fade out; moon pill with the minutes left next to the queue button (tap to change/turn off).
- [x] Credits card under the lyrics card: performers (tap → artist) and writers from composer
  tags or TTML songwriters (only ~17% of files have composer tags).
- [x] Autoplay (Settings → Playback, on by default): when the last song starts, up to 25 songs
  from Jellyfin's instant mix are added as an "Autoplay · similar songs" queue section (new
  origin 'autoplay'; drag rules unit-tested). Not with repeat on or offline.
- [x] Verified on the phone (2026-10-01).

## 5d. Accounts — built 2026-10-01
- [x] Several accounts (servers/users): `useAuth.accounts` in the Keychain (`rakki.accounts`);
  the existing sign-in becomes the first account. `src/auth/actions.ts`: signInAccount,
  switchAccount, signOut, removeAccount. Before another account takes over, the active one is
  wrapped up: queue + position saved (`suspendQueueForSwitch`), playback stopped, downloads in
  progress cancelled (`stopDownloads` generation guard, pending save flushed), query cache
  cleared. Per-account data (downloads, search index, queue, recent searches) reloads by user id.
- [x] Settings → Account: Add account (same sign-in form, `src/auth/LoginForm.tsx`, as a modal),
  Switch to (tap), remove (hold), Sign out (removes that account's downloads, switches to the next
  account). Hold the avatar on Home for a quick switcher.
- [x] Downloads never overwrite a file already on disk (another account may own it); "Remove all
  downloads" removes only the active account's files.
- [x] Profile picture: tap the avatar in Settings → pick a JPEG/PNG (iOS file picker) → POST
  `/UserImage` (base64 body). Since 0.2.0 it picks from Photos with a square crop
  (expo-image-picker).
- [x] Verified on the phone (2026-10-01).

## 5e. Feel pass — built 2026-10-01
- [x] Haptics (`src/lib/haptics.ts`, all behind Customize → Haptics): tick (buttons, chips,
  mini-player play/next, heart), thud (long-press menus, picking up a song to drag in the queue
  or playlist editor), success (added to a playlist, download started).
- [x] Press feedback: tiles, quick picks and genre tiles shrink a touch under your finger.
- [x] Spotify-style headers (`src/ui/CollapsingHeader.tsx`): on album, playlist, Liked Songs and
  genre pages the cover shrinks/fades/drifts as you scroll and a title bar in the page colour
  fades in; artist page: photo parallax + stretch on pull-down + title bar. Scroll-driven.
- [x] Heart pop in the full player (`HeartButton`); mini-player slides in when music starts.
- [x] Reduced motion also covers: Regular lyrics scrolling, the lyrics card, toasts, the
  mini-player entrance, the heart pop and tile shrink.
- Preview note: when the app window is minimised the browser pauses animation frames, so
  Reanimated styles don't update — test animations only while the window is visible.
- [x] Verified on the phone (2026-10-01).

## User notes after Phase 5 (2026-10-01) — done
- [x] Heart: one small bounce (no spring wobble).
- [x] Hold the heart in the full player → Add to playlist.
- [x] Genres on album and artist pages (`GenreChips`): 3 chips, "+N more" expands, tap → genre
  page. Artists: their own tags first, then their albums' genres by count (getArtistAlbums
  now asks for Genres).
- [x] Library → Songs tab (after Albums): all songs, sorts Alphabetical / Recently added / Artist /
  Album / Most played / Random, "Shuffle all songs" button; list only.
- [x] Random sort on Albums, Songs, Artists, Playlists, Downloaded. Server lists fetch one random
  batch of 200 (Jellyfin reshuffles every request, so paging would repeat); picking Random
  again reshuffles (`shuffleSeed`); client lists use `seededShuffle`.
- [x] Pull to refresh on every Library list: reshuffles with Random (old list stays until the new
  one arrives: `placeholderData: keepPreviousData`), otherwise reloads from the server.
- [x] Home: round shuffle button by the greeting → queue of 200 random songs ("Shuffled
  library"); offline, the downloaded songs shuffled.

## Exit test
The user can make Rakki look the way they want from one screen, and it remembers.
