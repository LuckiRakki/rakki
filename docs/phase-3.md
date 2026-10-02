# Phase 3: Browse and library UX

> **Status: done**, signed off 2026-10-01. Kept as the record of what was built.

Goal (FRAMEWORK.md §7): find and play anything in the 6.8k-track library in three taps or
fewer, and it feels like Spotify. Everything here is JavaScript, so it ships as
over-the-air updates. No new native build is needed.

Carried in from earlier phases:
- Theme plumbing (Phase 1): tokens come from a persisted appearance store through `useTheme()`, so the Phase 5 customizer is cheap.
- Lyrics card under the full player (Phase 2).
- Queue drag-to-reorder (Phase 1).

## Tasks

- [x] **0. Theme plumbing.** Done 2026-09-30 (verified on the signed-in preview, OTA fbb21fc8).
  - Appearance store: persisted and versioned, holding accent, background, text scale, corner roundness and density.
  - `ThemeProvider`, `useTheme()` and `makeStyles()`.
  - Migrate every existing component and screen off static `theme.ts` imports.
- [x] **1. UI kit.** `Sheet`, long-press `ContextMenu` (replaces the iOS action sheet), `Toast`, `Chip`, `Shelf`, `ItemTile` (round art for artists), `ItemRow`, `CollectionHeader`, `LikedArt`. Done 2026-09-30.
  - Context sheet: a bottom sheet replacing the iOS action sheet. Actions: Play next · Add to queue · Add to playlist · Go to album/artist · Like · Instant mix · Share.
  - Chip, section header, shelf, artist tile (round art), playlist tile (mosaic art), list rows.
- [x] **2. API.** Checked against the live server.
  - The genre list only works scoped to the Music library, and there are 640 genres, so tiles are ranked by album count.
  - The user has 0 playlists and 245 liked songs.
  - Artists (album artists), artist albums, "appears on", popular tracks, similar artists.
  - Playlists: list, items, create, add, remove, move, rename, delete.
  - Genres; search per type; favourites per type; most played; rediscover; random; instant mix.
- [x] **3. Home.** Quick grid plus shelves (1ceee36):
  - Jump back in, Recently added, Most played, Rediscover
  - Liked Songs, Your playlists, Random picks, Artists you play (top album artists over your most played songs).
- [x] **4. Search.** Done 2026-09-30.
  - Empty: "Browse all" genre tiles (colour from the cover album, top 40 then "Show all"). Focused: recent searches (items you opened, removable).
  - Typing: live results, a top result with Play, and chips (All / Songs / Artists / Albums / Playlists / Genres).
  - **Fuzzy search** (the user asked for it in this phase): on-device name index (`src/search/index.ts`, ~630 KB, built once in the background ~30 s, topped up every 3 h, full rebuild weekly), typo-tolerant scoring (`src/search/fuzzy.ts`), merged with Jellyfin's own search and ranked together; play count breaks ties.
- [x] **5. Library.**
  - Chips Playlists / Albums / Artists, remembered. Liked Songs is pinned at the top of Playlists. "+" creates a playlist.
  - Sort sheet (generic `OptionsPanel` in the overlay host) and grid ↔ list toggle, per chip, remembered (`src/library/view.ts`). Albums: Alphabetical / Recently added / Artist / Release year. Artists: Alphabetical / Recently added. Playlists: Recently added / Alphabetical. ("Recently played" left out: Jellyfin's DatePlayed sort on albums/artists looked wrong.)
- [x] **6. Artist page.** (1ceee36)
  - Backdrop header, Play / Shuffle / Radio.
  - Popular, Discography (Albums / Singles & EPs), Appears on, Similar artists.
- [x] **6b. Add to playlist sheet** (the user confirmed it works on the phone 2026-09-30) (Spotify style; the user called it "very important"):
  - A clean bottom sheet listing your playlists with their mosaic art, plus a search field and a **New playlist** button.
  - Playlists that **already contain the song are clearly marked** (filled check, "Already added"), so adding a duplicate is a deliberate choice.
  - Tap to add or remove, then **Done**. A small confirmation toast shows which playlist it went into.
- [x] **7. Playlist page.**
  - Header, Play / Shuffle, long-press "Remove from this playlist", Rename and Delete in the playlist menu, create from Library and from "Add to playlist".
  - Edit mode (pencil): rename field, drag handles, remove buttons (`src/ui/PlaylistEditor.tsx`). Moves/removes apply instantly and sync to Jellyfin; the name saves on Done.
- [x] **8. Genre and Liked Songs pages.** Liked Songs (1ceee36). Genre page: mosaic cover, Play/Shuffle (random 200 songs), your top songs, artists, albums.
- [x] **9. Queue drag-to-reorder.** `react-native-reorderable-list` (pure JS, OTA-safe). Drag by the handle or long-press; dropping above "Next from" makes a song "Next in queue" (`src/player/queueRows.ts`, unit-tested).
- [x] **10. Lyrics card** under the full player: scroll down; album-coloured card with the sung/upcoming lines, credit line, tap for full lyrics.

## Exit test
From Home, Search or Library, any song, album, artist or playlist in the library can be
found and played in three taps or fewer, long-press works everywhere, and the user signs it
off as feeling like Spotify.
