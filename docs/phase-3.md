# Phase 3: Browse and library UX

Goal (FRAMEWORK.md §7): find and play anything in the 6.8k-track library in three taps or
fewer, and it feels like Spotify. Everything here is JavaScript, so it ships as
over-the-air updates. No new native build is needed.

Carried in from earlier phases:
- Theme plumbing (Phase 1): tokens come from a persisted appearance store through `useTheme()`, so the Phase 5 customizer is cheap.
- Lyrics card under the full player (Phase 2).
- Queue drag-to-reorder (Phase 1).

## Tasks

- [ ] **0. Theme plumbing.**
  - Appearance store: persisted and versioned, holding accent, background, text scale, corner roundness and density.
  - `ThemeProvider`, `useTheme()` and `makeStyles()`.
  - Migrate every existing component and screen off static `theme.ts` imports.
- [ ] **1. UI kit.**
  - Context sheet: a bottom sheet replacing the iOS action sheet. Actions: Play next · Add to queue · Add to playlist · Go to album/artist · Like · Instant mix · Share.
  - Chip, section header, shelf, artist tile (round art), playlist tile (mosaic art), list rows.
- [ ] **2. API.**
  - Artists (album artists), artist albums, "appears on", popular tracks, similar artists.
  - Playlists: list, items, create, add, remove, move, rename, delete.
  - Genres; search per type; favourites per type; most played; rediscover; random; instant mix.
- [ ] **3. Home.** Quick grid plus shelves:
  - Jump back in, Recently added, Most played, Rediscover
  - Liked Songs, Your playlists, Random picks, Artists you play
- [ ] **4. Search.**
  - Empty: genre tiles and recent searches.
  - Typing: live results, a top result, and chips (Songs / Albums / Artists / Playlists).
  - **Fuzzy search** (user request, 2026-09-30): misspellings still find the right thing.
    - Jellyfin's search is substring-only, so Rakki keeps a local name index of songs, albums, artists and playlists, cached and refreshed in the background.
    - Typo-tolerant matching (fuzzy scoring on words and initials) is merged with the server's results.
- [ ] **5. Library.**
  - Chips: Playlists / Albums / Artists / Liked.
  - Sort sheet, grid ↔ list toggle, remembered choices.
- [ ] **6. Artist page.**
  - Backdrop header, Play / Shuffle / Radio.
  - Popular, Discography (Albums / Singles & EPs), Appears on, Similar artists.
- [ ] **7. Playlist page.**
  - Mosaic header, Play / Shuffle.
  - Edit mode: rename, drag to reorder, remove, delete. Create from the Library and from "Add to playlist".
- [ ] **8. Genre and Liked Songs pages.**
- [ ] **9. Queue drag-to-reorder.**
- [ ] **10. Lyrics card** under the full player.

## Exit test
From Home, Search or Library, any song, album, artist or playlist in the library can be
found and played in three taps or fewer, long-press works everywhere, and the user signs it
off as feeling like Spotify.
