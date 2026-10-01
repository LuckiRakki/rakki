# Phase 5: Parity and polish

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

## 5b. Lyrics tuning
- [ ] Spicy Lyrics knobs (×multipliers, 1 = official): glow, word pop, word lift, letter
  pop/glow, motion speed/damping, sweep band, line blur; font size, alignment, colours;
  backdrop spin/blur/brightness.
- [ ] Regular lyrics: font size, alignment, dim level, highlight colour.

## 5c. Parity
- [ ] Queue restore after a restart (queue, position, shuffle/repeat; starts paused).
- [ ] Volume normalization from Jellyfin's per-song NormalizationGain (on/off).
- [ ] Sleep timer (minutes, or end of song).
- [ ] Song credits (from Jellyfin's People: composers, lyricists, producers…).
- [ ] Autoplay similar music when the queue ends (on/off).

## 5d. Accounts
- [ ] Several servers/users, switch between them.
- [ ] Change your profile picture (pick an image from Files; upload to Jellyfin).

## 5e. Feel pass
- [ ] Haptics on key actions, animation polish, reduced-motion paths.

## Exit test
The user can make Rakki look the way they want from one screen, and it remembers.
