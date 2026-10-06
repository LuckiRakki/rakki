# Rakki — Project Framework

> Named **Rakki** (2026-09-29). Bundle ID `com.luckirakki.rakki`: never change it, or iOS treats it as a new app.
> Written 2026-09-29 as the plan, kept up to date as it was built.
> **Status 2026-10-02: version 1.0.0.** Phases 0–6 are done; the 1.0.0 native build is out
> (see [CHANGELOG.md](CHANGELOG.md)). Where the build differs from the original plan, the
> sections below say what was actually done.

## 0. What we're building

A **Jellyfin music client for iPhone** (iPhone 13 first). It should have:

- **Look and feel:** Spotify / Feishin. Dark, driven by album-art colour, gesture-heavy, bottom tabs, a mini-player, and a full player you swipe down to close.
- **Features:** everything Finamp and Feishin do that makes sense on a phone (full matrix in §6).
- **Headline feature:** Spicy Lyrics built in. It uses the same word-by-word engine as the web mod (it's TypeScript, so it carries over almost as-is) and the plugin's `/SpicyLyrics/{id}/ttml` endpoint.

---

## 1. Hard constraints (everything else follows from these)

| Constraint | Consequence |
|---|---|
| **No Mac.** The dev machine is Windows 10. | iOS apps can only be *compiled* on a Mac, whatever the framework. We use GitHub's cloud Macs. Expo keeps that to **rare** builds (§3). |
| **Free Apple ID + SideStore** (decided) | Apps expire every **7 days** (SideStore re-signs on the phone). **3 app slots**, and SideStore takes one, so that's SideStore + Rakki-dev + Rakki. No CarPlay, no push notifications. |
| **Expo's cloud build (EAS) can't sign for a device without the $99 account** | We build **unsigned** `.ipa`s on GitHub Actions and SideStore signs them with the free Apple ID. |
| **Only one VPN at a time on iOS** | SideStore's refresh uses its own loopback VPN, and so does Tailscale. The weekly refresh means switching Tailscale off for a moment. |
| **Login screen like Finamp** (decided) | You type the server URL (e.g. `http://<tailscale-ip>:8097`) on first launch. `http://` must work, so the app ships an **App Transport Security exception** (`NSAllowsArbitraryLoads`). No server address or credentials are ever in the code. |
| **Spicy Lyrics API Terms** | Every lyrics surface shows `Source` + `Attribution` (Uploader/Maker links when the source is `spicy_lyrics`). The client never stores API lyrics; the plugin handles the 30-day cache. |
| **Licences** | Feishin = GPL-3.0, Spicy Lyrics = AGPL-3.0, Finamp = MPL-2.0. **Rakki = AGPL-3.0 from day one**, so Feishin's TypeScript and any Spicy Lyrics code can be copied in legally, and Finamp is used as a reference. Keep a `NOTICE.md`. |

---

## 2. Tech stack: **React Native + Expo** (TypeScript)

### How the app actually gets onto the iPhone

| Stage | What runs on the phone | Mac build needed? | When |
|---|---|---|---|
| **A. Expo Go** | The **Expo Go** app from the App Store loads our code over the network from `npx expo start` on the PC, with live reload. | **None** | Phase 0: UI, login, browsing, foreground playback. |
| **B. Dev build** | Our own "Rakki-dev" app (Expo Go plus our native modules), built **once** on GitHub's Mac and installed with SideStore. It still loads the code live from the PC. | Only when a **native** module is added or changed (rare) | From Phase 1 on: background audio, lock screen, downloads. |
| **C. Release build** | "Rakki", the everyday app with the code bundled in, so it works without the PC. | Per milestone | Whenever a version is worth using day to day. |

Every screen, animation, gesture and lyrics tweak is plain TypeScript and **shows up on the real iPhone within seconds**. A Mac build (~15 min on GitHub) is only needed when a native library changes.

*(Flutter would compile just the same on GitHub's Mac, but it can't live-reload onto an iPhone without a Mac attached. You'd test on a Windows window and wait for a full build to see anything on the phone. That's why we chose Expo.)*

### Why this stack fits the project

- **The Spicy engine is already TypeScript.** `Spring.ts`, `Spline.ts` and the curve constants from the web mod copy across nearly verbatim, and the golden-trace tests are the *same code*, so they match by construction.
- **Feishin is TypeScript/React** (TanStack Query + Zustand). Its Jellyfin API layer and normalisers port directly, and so does its state approach.
- **Real-device loop:** a Spotify-feel app lives or dies on gestures and scroll physics, which you can't judge in a desktop window.
- **Android bonus:** `npx expo run:android` builds on this PC (the Android SDK is already installed), so the head unit can run it too.

### Known weak spot: gapless audio

**Decision (Phase 1, 2026-09-29): our own engine, `modules/rakki-audio`** (Swift, local Expo module).
- **Rejected: `react-native-track-player` v5 (`@rntp/player`).** It became commercially licensed (free only for personal use; €99/month for commercial use), which sits badly in a public AGPL app, and it's only "gapless-like".
- **Rejected: plain `expo-audio`.** Its lock screen has no next/previous track commands.
- **The engine copies how Finamp does it** (`just_audio` + `audio_service`, both MIT):
  - an `AVQueuePlayer` with a 2-song look-ahead "treadmill", for **true gapless** playback
  - native lock-screen and Control Center commands (play, pause, next, previous, scrub)
  - now-playing info with artwork
  - handling for interruptions and headphone unplugs
  - repeat off/all/one
  - per-track gain
  - an AirPlay picker view
  - a synchronous `getProgress()` for the lyrics
- On web and in Expo Go, an `expo-audio` fallback engine sits behind the same interface (`src/player/engine.ts`).

### Packages (as built, 1.0.0)

| Concern | Package |
|---|---|
| App shell, routing, tabs | `expo` (SDK 57), `expo-router` (a stack per tab, like Spotify) |
| Server data and caching | `@tanstack/react-query` (same as Feishin) |
| Client state (player, UI, settings) | `zustand`, persisted with `expo-sqlite/kv-store` |
| HTTP | `fetch` with our own Jellyfin client (`src/api/jellyfin.ts`); no axios |
| Secrets | `expo-secure-store` (tokens in the Keychain, several accounts) |
| Audio | `modules/rakki-audio`, our Swift engine (AVQueuePlayer treadmill, remote commands, now playing, AirPlay picker, audio-tap levels); `expo-audio` as the fallback on web |
| Downloads | `expo-file-system` (background `DownloadTask`s) |
| Lists | React Native `FlatList`; `react-native-reorderable-list` for drag-to-reorder |
| Animation / gestures | `react-native-reanimated`, `react-native-gesture-handler` |
| Lyrics rendering | `@shopify/react-native-skia` (sweep shader, blur glow, font fallback runs) |
| Images | `expo-image` (disk cache, blurhash placeholders) |
| Look | `expo-blur`, `expo-linear-gradient`, `expo-haptics`, Inter / DM Sans / Figtree / Plus Jakarta Sans |
| Video | `expo-video` (in-app music videos, from 1.0.0) |
| Widgets, icons, photos | `expo-widgets` (patched for SideStore's app groups), `expo-alternate-app-icons`, `expo-image-picker` |
| Updates | `expo-updates` (EAS Update, channel `production`) |
| Dev client | `expo-dev-client` (the Rakki Dev app) |

**Art colours for free:** Jellyfin sends `ImageBlurHashes` for every image. A blurhash encodes a small grid of colours, so we pick the most vivid one for gradients and the mini-player tint. This needs **no image decode**.

---

## 3. Build and delivery pipeline

```
 Windows PC                              GitHub (public repo)                    iPhone 13
 ──────────                              ────────────────────                    ─────────
 npm run phone -- --dev-client ── live code over Tailscale ─────────────────▶  Rakki Dev
 git push main ────────────────────────▶ check.yml: typecheck + lint
                                         update.yml: EAS Update ──────────────▶ Rakki downloads
                                                                                 it on next launch
 Actions → iOS build (by hand) ────────▶ ios.yml: expo prebuild → pod install →
                                         xcodebuild (unsigned, ad-hoc signed
                                         entitlements) → Rakki.ipa ───────────▶ SideStore installs
                                                                                 + re-signs weekly
```

- **Everyday changes ship over the air.** Every push to `main` that touches app code runs
  `update.yml`: typecheck and lint, then `eas update` to the `production` channel. The app
  checks on launch (and from Settings → About). Each update carries its number and commit
  (`RAKKI_UPDATE` / `RAKKI_COMMIT`, shown in Settings → About).
- **Native changes need a build.** `ios.yml` runs by hand with a variant:
  - `release`: the everyday app, published as the `ios-latest` GitHub Release (`Rakki.ipa`).
  - `dev`: "Rakki Dev" (its own bundle id), which loads the code live from the PC.
  - `check`: the release build without publishing it, to prove native changes compile.
- **Runtime versions:** an update only reaches builds with the same `runtimeVersion`
  (app.json). It names the native build and changes only with one: `0.2.0` (2026-10-01),
  `1.0.0` (2026-10-02). `expo.version` is Rakki's own a.b.c version (§10, decision 6).
- **Repo: public** (decided). Public repos get **unlimited free** macOS minutes. Safe because
  the login screen keeps the server address and credentials out of the code.
- Publishing from the PC (`eas update`) times out on its slow upload, which is why it runs on
  GitHub. It needs the `EXPO_TOKEN` repository secret (a personal token).

### College Macs (Xcode): the hands-on tool, not the main pipeline

GitHub stays the main builder: it works from home around the clock and needs no trip. Use a college Mac when you need to **see inside** the app:

- **Native crashes:** the Xcode console shows the real error when the app dies on launch, which CI logs can't do.
- **Performance:** Instruments (Time Profiler, Core Animation FPS) on the iPhone over a cable, for the Phase 2 lyrics 60 fps exit test.
- **Custom Swift code** (e.g. the Phase 5 gapless module): compile errors in seconds instead of a ~15 min CI round-trip.
- **Plan B:** if the CI build breaks, open the project in Xcode to get the full error.
- **Direct install:** `npx expo run:ios --device` builds and installs over a cable. Free-Apple-ID signing still expires after 7 days, and **SideStore can only refresh apps it installed itself**, so the everyday copy should come through SideStore.

First visit checklist:
- Xcode version (Xcode → About). Must meet the Expo SDK minimum.
- Can Node be installed without admin rights (nvm into your home folder)?
- Is CocoaPods present?
- Does the iPhone "Trust this computer" prompt work over USB?

Shared-machine hygiene:
- Sign out of your Apple ID in Xcode → Settings → Accounts before leaving.
- Delete the project folder and DerivedData.
- Never let it save your password.

**iPhone setting required either way:** Settings → Privacy & Security → **Developer Mode** ON. iOS 16+ won't open development-signed apps without it, and that includes SideStore installs.

---

## 4. Architecture

```
┌──────────────────────── app/ (expo-router screens) ──────────────────────┐
│ (tabs) Home · Search · Library │ album/[id] artist/[id] playlist/[id]    │
│ player (modal sheet) · queue · lyrics · settings · login                 │
└───────────────┬──────────────────────────────────────┬───────────────────┘
                │ TanStack Query hooks                 │ zustand player store
┌───────────────▼────────────────┐     ┌───────────────▼──────────────────┐
│ src/api  (Jellyfin client,     │     │ src/player (engine + store: queue│
│ endpoints, Feishin normalisers)│     │ reporting, normalization, sleep, │
│ src/server  MusicServer iface  │     │ queue persistence, radio)        │
└───────┬───────────────┬────────┘     └──────┬──────────────────┬────────┘
        │               │                     │                  │ position
┌───────▼──────┐ ┌──────▼──────────┐ ┌────────▼───────┐ ┌────────▼────────┐
│ fetch → HTTP │ │ kv-store        │ │ src/downloads  │ │ src/spicy       │
│              │ │ settings, queue,│ │ bg URLSession, │ │ engine (TS from │
│              │ │ dl index, search│ │ files on disk  │ │ web mod) + Skia │
└──────┬───────┘ └─────────────────┘ └────────────────┘ │ renderer        │
       │                                                └─────────────────┘
  Jellyfin 10.11 + Spicy Lyrics plugin
```

### Folder layout

```
src/app/                 Expo Router screens
  (tabs)/(home,search,library)/   Home, Search, Library and the pages shared by all three tabs:
                                  album/[id], artist/[id], playlist/[id], genre/[name],
                                  releases/[id], liked
  player, queue, lyrics, video, settings, customize, lyrics-style, downloads,
  login, add-account, add-station, edit-station, library-tabs     (modal screens)
src/api/                 Jellyfin client, React Query hooks
src/auth/                accounts (Keychain), sign-in, profile picture
src/player/              engine.ts (native / fallback), store.ts (queue), reporting, sleep timer,
                         offline listens, MiniPlayer
src/lyrics/              loading (TTML / LRC / plain → one model), Regular mode, LyricsStage
src/spicy/               the Spicy renderer: Spring, Spline, scene.ts (Skia), font fallback
src/library/             Library tabs, sorting, actions (play, shuffle, radio, playlists)
src/search/              on-device fuzzy index + server search
src/downloads/           download manager, files on disk, offline data
src/radio/               stations, SUB/WAVE API, live now-playing, radio lyrics timing
src/video/               music video matching and the in-app player
src/widgets/             widget layouts and the data the app shares with them
src/appearance/          the customizer store, presets, fonts, Lucid accent
src/settings/  src/ui/  src/lib/      settings store, shared components, helpers
modules/rakki-audio/     Swift: RakkiPlayer (engine), RakkiLevels (visualizer tap), module
patches/                 patch-package (expo-widgets app-group fix for SideStore)
```

### Key technical designs

- **Auth:** a server URL field, then username/password or **Quick Connect**. `http` and `https` both accepted. Token goes in the Keychain. Multiple servers and users are modelled from day one.
- **Streaming:** `/Audio/{id}/universal` with a container list iOS plays natively (AAC/ALAC/MP3/FLAC) and a transcode fallback. Separate max bitrate for Wi-Fi and cellular.
- **Playback reporting:** `/Sessions/Playing`, `…/Progress`, `…/Stopped`. This updates play counts and Last.fm (through the server) and feeds "Recently played".
- **Normalization:** `NormalizationGain` (LUFS, Jellyfin 10.9+), falling back to the ReplayGain tag, applied as per-track volume (attenuate only).
- **Queue persistence:** the queue, index and position are saved (kv-store, per user) and restored on launch.
- **Offline:** the downloads index is in kv-store; songs are real files under Documents/Music. The player uses a local file before a stream. Offline mode shows only what's downloaded.
- **Images:** `/Items/{id}/Images/Primary?maxWidth=…&tag=…` through `expo-image`, with the blurhash placeholder shown first.

### Two lyric systems: **Spicy** (the focus, default) and **Regular**

The user wants both, with the effort going into Spicy. Both share one data layer and differ only in the renderer.

| | **Spicy Lyrics mode** (default) | **Regular mode** |
|---|---|---|
| Look | The full web-mod engine (below): per-word springs, letter emphasis, background vocals, duets, depth blur, spinning art backdrop | Clean Spotify/Apple Music style: the current line is bright, other lines dimmed, smooth auto-scroll on the art colour |
| Motion | UI-thread worklets + Skia, every word animated | One highlight transition per line. Light on battery |
| Word timing | Used fully (TTML) | Ignored. Lines only |
| When it's the right choice | Everyday listening, the showpiece | Long sessions, low battery, or when you just want to read along |
| Effort | Most of Phase 2 | About a day, built after Spicy |

- **Shared data layer** (`src/lyrics/`): the TTML payload, Jellyfin LRC and plain text are all normalised into one model: `{ synced, lines[{ startMs, endMs, text, words?, bgWords?, agent? }], source, attribution }`. Both renderers consume it.
- **Graceful fallback:** Spicy mode with only LRC available renders line-synced in Spicy style (vertical line sweep, as in the web mod). Unsynced lyrics are a static scroll in both modes.
- **Switching:**
  - A setting chooses the default mode (Spicy).
  - A one-tap **Spicy ⇄ Regular** toggle sits on the lyrics screen, like the web mod's Word/Line toggle but choosing between renderers. It's remembered.
  - The lyrics card under the full player follows the current mode.
- **Both** show tap-to-seek, auto-scroll that pauses while you're scrolling manually, and the `Source`/`Attribution` credit line (API Terms).

### Spicy Lyrics integration

- **Data:** `GET /SpicyLyrics/{id}/ttml` returns `{ IsSynced, Lines[{ StartMs, EndMs, Words[], BgWords[], Agent }], Source, Attribution{Uploader,Maker} }`. Fall back to `/Audio/{id}/Lyrics` (LRC or plain).
  - Keep the web mod's guard: `isSynced = IsSynced && hasRealTiming`.
  - Port the mapping from the web mod's `JellyfinAdapter.fetchTtmlLyrics`.
- **Engine:** copy `Spring.ts`, `Spline.ts` and the curve and timing math from the canonical web-mod repo (2026-09-29 official model):
  - Each word gets 3 springs (scale, lift, glow) chasing spline targets.
  - Held words (1000 ms or longer) split into letters with a `1/(1+d^2.8)` falloff.
  - Lines are lit only inside their own `[start, end)`, and inactive lines blur by `1.25px × distance`.
  - Planned as UI-thread worklets; **as built** the scene ticks on the JS thread with `requestAnimationFrame` and records an `SkPicture` per frame, which holds 60 fps on the iPhone 13 (confirmed on device, 2026-09-30).
- **Rendering (Skia canvas):**
  - Word layout is computed once per song and size (`SkFont` measurement; characters the font lacks are drawn with iOS system fonts, see `src/spicy/fallback.ts`).
  - Each frame only updates transforms, the gradient-sweep shader position and the blur-mask glow. No React re-renders per frame.
  - Only the `[active-2 … active+1]` line window ticks.
  - Letters are split only for held words. (These are the perf lessons from the head unit.)
- **Timing:** `RakkiAudio.getProgress()` is synchronous and interpolated natively, so the lyrics can read it every frame.
- **Surfaces:**
  1. A lyrics card under the full player (Spotify style) that expands into
  2. a full-screen Spicy view with the spinning, blurred art backdrop, tap-to-seek and the Word↔Line toggle.
- **Settings:** the same ×multiplier knobs as the web mod, where 1 = official.
- **Attribution:** the credit line is always shown.
- **Later:** extract `spicy/engine` into a small shared package used by *both* the web mod and the app, so they never drift apart.

---

## 5. UI/UX spec (Spotify × Feishin)

**Shell**
- Bottom tabs: **Home · Search · Library**.
- Persistent **mini-player** above the tab bar, tinted by the art colour, with a thin progress line. Swipe left/right to skip, tap to open.
- **Full player** as a draggable sheet (swipe down to dismiss).

**Design tokens**
- Colours: background `#121212`; surfaces `#181818` / `#242424` / `#2A2A2A`; text 100% / 70% / 50% white; accent = art colour (fallback Spicy blue).
- Type: Inter.
- Spacing: 8-pt grid.
- Corner radii: 4 (art), 8 (cards), full pills (chips).
- Haptics on play/pause, long-press and reorder.

| Screen | Contents |
|---|---|
| **Login** | Server URL (http/https), then username/password or Quick Connect code. Remembers servers. |
| **Home** | Greeting and a 2×3 grid of recent items. Carousels: Jump back in, Recently added, Most played, Rediscover, Favorites, Your playlists, Random picks, Instant mixes. |
| **Search** | When empty: colourful genre tiles. When typing: live results with chips (Songs / Albums / Artists / Playlists), top result card, recent searches. |
| **Library** | Chips (Playlists / Albums / Artists / Downloaded / Favorites), sort sheet, grid↔list toggle, A–Z scrubber. |
| **Album** | Art over an art-colour gradient header, Play and Shuffle buttons, heart, download toggle. Track list with disc groups. "More by artist". |
| **Artist** | Parallax backdrop. Popular (by play count), Discography (Albums / Singles / EPs), Appears on, Similar artists, Artist radio. |
| **Playlist** | Mosaic header, edit mode (rename, drag to reorder, remove), add songs. |
| **Full player** | Art carousel (swipe to change track), marquee title, heart, seek bar, shuffle/prev/play/next/repeat, AirPlay picker, queue, sleep timer, lyrics card, then About-the-artist and credits cards below. |
| **Queue** | Now playing, then "Next in queue", then "Next from: <context>", then Autoplay/radio. Drag to reorder, swipe to remove. |
| **Lyrics** | Opens in **Spicy mode** by default: full screen, spinning blurred backdrop, word engine, settings sheet. One tap switches to **Regular mode**: clean line-by-line on the art colour. Attribution in both. |
| **Context sheet** (long-press anywhere) | Play next · Add to queue · Add to playlist · Go to album/artist · Download · Favorite · Instant mix · Share. |
| **Settings** | Servers/users, streaming quality (Wi-Fi/cellular), download quality, normalization, cache/storage, **Customize** (below), about/licences. |
| **Customize** | The in-depth customizer: every look-and-feel choice, with a live preview (below). |

### In-depth customizer (user request, 2026-09-29)

The user wants to choose colours, sizes and similar details themselves. So every visual choice in the app is a **setting with a sensible default**, never a hard-coded value.

**What can be customised**

| Area | Options |
|---|---|
| **Colour** | Accent, two modes (user decision, 2026-09-30): **Custom** is your own colour (picker + hex + presets). **Lucid** takes the accent from the *currently playing* album's art, else the *last played* album's; with neither, it falls back to your Custom colour. Background: near-black `#121212` / true OLED black / art-tinted. Surface contrast. How strongly art colour tints headers, the mini-player and the player. |
| **Type and size** | Font (Inter / system SF / Plus Jakarta Sans / …). Global text size (×0.85–1.4, on top of iOS Dynamic Type). Title weight. |
| **Shape and density** | Corner roundness (square → very round). Density: compact / comfortable / spacious. Album grid 2 / 3 / 4 columns. Tile and art sizes. List vs grid default per library tab. |
| **Home** | Show, hide and reorder shelves (Jump back in, Recently added, Most played, Rediscover, Favorites, Playlists, Random, Instant mixes). Quick-pick grid on/off and size. Greeting on/off. |
| **Mini-player and tab bar** | Mini-player style: art-tinted / solid / frosted glass. Progress line on/off. Tab labels on/off. |
| **Now playing** | Background: blurred art / gradient / solid / spinning art (Spicy style). Art size and corner radius. Which buttons show and their order. Lyrics card on/off. |
| **Spicy Lyrics** | The web mod's ×multiplier knobs (1 = official): glow, word pop, word lift, letter pop/glow, motion speed/damping, sweep band, blur per line. Plus font, font size, alignment, sung/unsung colours, and backdrop spin/blur/brightness/tint. |
| **Regular lyrics** | Font size, alignment (left/centre), dim level of other lines, highlight colour, background. |
| **Motion and feel** | Animations full / reduced (also follows iOS Reduce Motion). Haptics on/off. |

**How it works**
- **Live preview:** every control updates the real UI instantly, and each section has a small preview (a sample album row, the mini-player, lyrics lines).
- **Presets:** *Rakki* (default), *Spotify-like*, *Apple Music-like*, *OLED black*, *Big & bold*. Choosing one fills every value, and you can then tweak from there.
- **Reset:** per section and for everything.
- **Share:** export and import a theme as a small JSON file or string, so you can back it up or pass it on.
- **Versioned storage** (`_v`, as in the web mod's `Settings.ts`), so new options merge in without wiping your choices.

**Architecture: why the plumbing comes early**
- Today, components import fixed values from `src/ui/theme.ts`.
- **In Phase 1** they switch to a `useTheme()` hook backed by a persisted `appearance` store (zustand + `expo-sqlite/kv-store`), and all colours, sizes, radii and fonts flow from it. This is cheap now and painful once there are 50 screens.
- New components must read tokens from `useTheme()`. No literal colours or sizes in screens.
- The Customize **screen** itself is built in Phase 5. The Spicy/Regular lyrics controls are built in Phase 2, alongside the renderers they tune.

---

## 6. Feature matrix (Finamp ∪ Feishin, iOS-applicable)

`F` = Finamp, `Fs` = Feishin. Phase numbers refer to §7. Status as of 1.0.0.

| Feature | From | Phase | Status |
|---|---|---|---|
| Login: server URL (http ok), password, Quick Connect, multiple servers/users | F, Fs | 0 / 5 | ✅ |
| Browse albums / artists / songs / genres / playlists, sort and filter | F, Fs | 0 / 3 | ✅ |
| Stream with transcoding choice (Wi-Fi vs cellular bitrate) | F | 1 | ✅ |
| Background audio, lock screen, Control Center, AirPlay | F | 1 | ✅ |
| Queue: play next, add, reorder, remove, clear, shuffle, repeat | F, Fs | 1 | ✅ |
| Playback reporting (play counts, Last.fm through the server) | F, Fs | 1 | ✅ |
| Mini-player and full player | F, Fs | 1 | ✅ |
| Gapless (native AVQueuePlayer treadmill; verify on device) | F | 1 | ✅ |
| **Spicy Lyrics mode**, the focus (word, bg vocals, duets, letters, dots, attribution) | ours | 2 | ✅ |
| **Regular lyrics mode** (line-by-line, Spotify-style) + Spicy ⇄ Regular toggle | F, Fs | 2 | ✅ |
| Shared lyrics data layer (TTML + LRC + plain, one model) | ours | 2 | ✅ |
| Home carousels | Fs | 3 | ✅ |
| Search with filters and genre tiles | F, Fs | 3 | ✅ |
| Album / artist / playlist pages (popular, discography, similar) | Fs | 3 | ✅ |
| Favorites everywhere | F, Fs | 3 | ✅ |
| Playlist create / edit / reorder / delete | F, Fs | 3 | ✅ |
| **Spotify-style "Add to playlist" sheet** that clearly shows which playlists already contain the song (user: "very important"), plus New playlist | ours | 3 | ✅ |
| Context sheets (long-press) | F, Fs | 3 | ✅ |
| Art-colour theming (from blurhash) and placeholders | F, Fs | 3 | ✅ |
| Downloads: album/playlist/artist, transcoded downloads, storage manager | F | 4 | ✅ albums, playlists, Liked Songs, songs (no whole-artist download) |
| Offline mode | F | 4 | ✅ |
| Queue restore on launch | F | 5 | ✅ |
| Instant mix / artist radio / auto-continue when the queue ends (smart queue since 1.6.0: src/player/smartQueue.ts) | F, Fs | 5 | ✅ |
| Normalization (NormalizationGain / ReplayGain) | F | 5 | ✅ |
| Sleep timer | F | 5 | ✅ |
| Credits / "Written by" / about the artist | Fs | 5 | ✅ |
| Theme plumbing: every colour/size/font from a persisted `useTheme()` store | ours | 1 | ✅ |
| Lyrics customizer (Spicy knobs + Regular options) | ours | 2 | ✅ |
| **In-depth customizer** screen: colours, type, shape/density, Home layout, player, presets, import/export | ours | 5 | ✅ |
| Lyrics screen truly full-screen (no sheet gap at the top) with header/footer fades | ours | 5 | ✅ |
| **Widgets:** home screen (jump back in / resume) and lock screen (open Rakki, last played), Live Activity | new | 6 | ✅ (Live Activity skipped) |
| iPad / landscape | F | 6 | not built |
| Android head-unit build | ours | 6 | not built |
| CarPlay (**needs the $99 account**) | F | 6 | not built |
| Navidrome/Subsonic support | Fs | 6 (optional) | not built |
| *Not applicable on iOS:* MPV backend, desktop mini-window. (Discord RPC can't run on iOS directly; see the ideas backlog for a bridge.) | Fs | — | |

---

## 7. Roadmap. Each phase has an exit test.

**v1 = Phases 0–4** (a daily driver). Phases 5–6 are polish and extras.

**Status 2026-10-02: all phases done.** Phases 3–6 have their own task lists
(docs/phase-3.md … phase-6.md). After Phase 6 came the 0.7–0.12 updates (versioning, offline
listens, Last.fm, music videos, radio, station editing) and the **1.0.0 native build**:
audio-tap visualizer, live radio lock screen, in-app video player, launch screen. Not built:
iPad, the Android head-unit build, CarPlay and Navidrome (Phase 6 extras), and two backlog
ideas (Discord Rich Presence, a desktop app).

### Phase 0: Foundations (stage A, Expo Go, no Mac build) ✅
- `create-expo-app` (TypeScript), AGPL licence, git repo and public GitHub remote, folder layout, tokens, tab shell.
- Login screen (URL + password + Quick Connect), Albums list, album page, **foreground** playback with `expo-audio`.
- CI: `check.yml` + a first `ios-dev.yml` run, installed via SideStore. This proves the risky pipeline before we depend on it.
- **Exit:** in Expo Go on your iPhone you log into your server over Tailscale, browse albums and play a track, and edits on the PC appear on the phone live. Separately, a CI-built `.ipa` installs through SideStore and launches.
- **Status 2026-09-29:** the Expo Go half is ✅ **working on the user's iPhone** (login, Home, Library, album, playback). Repo + `check.yml` + a manual-only `ios.yml` are set up.
  - **Decision (user):** skip the Phase 0 test build. The first iOS build and the SideStore setup move to the **start of Phase 1**, where we need the dev build anyway, so we build once instead of twice.
  - Expo Go (SDK 57+) on iOS requires Expo Go and the PC's Expo CLI to be signed in to the **same Expo account** (luckirakki). This doesn't apply to our own dev build.

### Phase 1: Player core (stage B, dev build) ✅
- **First:** add `expo-dev-client` + the Rakki audio engine, run `ios.yml` once, and set up SideStore to install Rakki Dev. This is the pipeline test moved from Phase 0.
  - ✅ Done: the first dev build compiled on the first attempt (Xcode 26.6, ~11 min compile).
  - It also includes Skia, `expo-sqlite` and `expo-network`, so Phase 2 needs no new build.
- ✅ Written: engine + queue store, Jellyfin reporting, mini-player (tap and swipe), full player, queue, settings (Wi-Fi/cellular quality), and long-press actions (Play next / Add to queue / Like / Go to album).
- Theme plumbing for the customizer: `useTheme()` + persisted appearance store; move the Phase 0 screens onto it.
- Gapless test on a known gapless album.
- **Exit:** you can listen to a whole album with the screen locked using lock-screen controls, it shows in Jellyfin's "Now playing" and play counts, and we have a verdict on gapless.

### Phase 2: Lyrics (Spicy first, then Regular) ✅ (signed off 2026-09-30)
1. **Shared data layer:** TTML/LRC/plain normalised to one model, with the unsynced guard and attribution.
2. **Spicy mode (most of the phase):** engine copied and ported to worklets, golden traces in `jest`, Skia canvas, full-screen view, backdrop, settings, LRC-in-Spicy-style fallback.
3. **Regular mode:** line-by-line renderer, the Spicy ⇄ Regular toggle, and the default-mode setting.
4. **Lyrics card** under the full player, following the current mode.
- **Exit:** the traces match; a release build on the iPhone holds 60 fps in Spicy mode through a dense TTML song (checked with the perf monitor); the toggle switches modes mid-song without losing position.

### Phase 3: Browse and library UX ✅ (signed off 2026-10-01)
- Home, Search, Library, Artist, Playlist, context sheets, favorites, playlist editing, art colours.
- **Exit:** you can find and play anything in the 6.8k-track library in 3 taps or fewer, and it feels like Spotify.

### Phase 4: Offline ✅ (2026-10-01)
- Background downloads, transcoded downloads, storage screen, offline mode, local-first playback. Our own TTML sidecar lyrics are cached with downloads (never API lyrics).
- **Exit:** in Airplane mode, downloaded albums play with lyrics.

### Phase 5: Parity and polish ✅ (2026-10-01)
- Queue restore, instant mix/radio, normalization, sleep timer, credits, multi-server, custom gapless module if Phase 1 said so, haptics and animation pass.
- **The in-depth customizer screen** (§5): every area, live previews, presets, reset, theme import/export.
- **Lyrics screen covers the whole screen** (user feedback, 2026-09-30).
  - Today it opens as an iOS sheet, which leaves a strip of the player visible at the top. Present it full-screen and keep swipe-down-to-close with our own gesture.
  - Add soft dark fades behind the header and footer, so lyrics scrolling under the title, toggle and credit line stay readable.

### Phase 6: Extras ✅ widgets (2026-10-01)
- **Widgets: built 2026-10-01** (see docs/phase-6.md). Now Playing (small, medium, Lock Screen) and Jump Back In (medium, large) through `expo-widgets`, with a patch for SideStore's app-group renaming. Live Activity skipped (no Dynamic Island; the Lock Screen already has media controls). Arrived with the 0.2.0 native build. The original plan:
- **Widgets** (user request, 2026-09-30; like YouTube Music / Spotify):
  - **Home screen:** a small widget (last played art, tap to resume) and a medium "Jump back in" grid (recent albums/playlists, each opens in Rakki).
  - **Lock screen:** a circular Rakki button that opens the app, and a rectangular "last played" that resumes it.
  - **Live Activity** on the lock screen while playing (the iPhone 13 has no Dynamic Island).
  - Built as a WidgetKit (SwiftUI) extension through a config plugin (e.g. `@bacons/apple-targets`). The app shares "recently played / now playing" with the widget through an App Group. Taps deep-link into Rakki (`rakki://album/<id>`, `rakki://resume`).
  - **Check first:**
    - Free-Apple-ID signing plus SideStore with an app extension and an App Group. Each extension uses one of the 10 App IDs per week.
    - Needs a new native build (version bump).
- iPad, head-unit APK, CarPlay (only with the $99 account), Navidrome.

### Ideas backlog (not scheduled; the user will decide scope later)
- ~~**Music video support**~~: built in 0.10.0 (see CHANGELOG): videos from the Music Videos library, matched to songs; iOS's player until the in-app player came with the 1.0.0 build. Still open: online sources (e.g. YouTube) if wanted.
- **Live-updating desktop app** (the user's idea, 2026-10-01; still in the backlog): a desktop Rakki that updates itself live like the phone app does over the air. Options to weigh: Expo for web packaged with Electron/Tauri plus an auto-updater, or extending Feishin.
- ~~**SUB/WAVE radio integration.**~~ Built in 0.11.0 (see CHANGELOG): a Radio section like Feishin's, SUB/WAVE stations recognised by address with now playing, DJ/show, requests and history. 0.12.0 added station editing (name, picture, website), radio lyrics that follow the live stream, and live stop/play; 1.0.0 the live lock screen. SUB/WAVE manual: https://www.getsubwave.com/manual.
- ~~**Fuzzy search.**~~ Built in Phase 3 (the user said go, 2026-09-30): see docs/phase-3.md task 4.
- ~~**Online play counts on tracks (like Spotify).**~~ Built: an artist's Popular songs sort by Last.fm worldwide plays (0.9.0) and album pages show each song's Last.fm plays (0.10.0, can be turned off), with the user's own API key, cached for days and labelled. Spotify was ruled out: its public API only has a 0–100 popularity score, and the real counts sit behind its private API (against its terms).
- ~~**Native builds**~~ (the user batches native changes): **0.2.0** (2026-10-01): the Files app folder, downloads kept out of iCloud backups, widgets, the neko app icon plus the Neko player and Lyric lines alternates (Customize → App icon), the Photos picker. **1.0.0** (2026-10-02): the audio-tap visualizer, the live radio lock screen, the in-app video player (expo-video), the launch screen.
- ~~**Next native build**~~ (the user's notes, 2026-10-02): **built as 1.2.0** (2026-10-03). Icons from assets/icons/source/build_app_icons.py; glass alternates via plugins/withGlassAlternateIcons.js. The plan was:
  - App icon color picker: all 17 palettes (Classic … Midnight, assets/icons/variants) as
    built-in presets in Customize → App icon with previews; iOS only switches between icons
    bundled in the build, so new colors mean a new build. Each preset as Liquid Glass (.icon,
    assets/icons/source/liquid_glass.py) and flat (recolor.py), with a Rakki setting to choose
    glass or flat (iOS has no per-app glass switch). expo-alternate-app-icons only makes flat
    .appiconset alternates: the glass ones need a small config plugin; check with a `check`
    build first.
  - Launch screen: the Neko player icon on a transparent background, not too big.
  - From 1.0.1: the player sets its audio session before every play and never holds the
    display awake (already in the code).
- **Next native build (planned; the user's notes, 2026-10-04):**
  - **Music videos turn with the phone**: allow landscape in the app (it's portrait-only today)
    and lock every screen except the video player to portrait (expo-screen-orientation), so a
    video goes full screen sideways on its own and back.
  - **Performance log hardware readings** (1.6.0's JS already asks for them; builds without
    them log the rest): modules/rakki-audio/ios/RakkiDeviceStats.swift adds `deviceStats()`
    (CPU seconds via getrusage, phys_footprint memory, thermal state, battery level/state,
    Low Power Mode, brightness) and `takeMetricReports()` (MetricKit daily metric and
    diagnostic payloads: GPU time, background audio time, background exits such as CPU-limit
    kills, hangs). Written but not compiled yet: check the CI build log for it first.
  - **Music videos on the lock screen** (1.5.5 plays their sound in the background, but the
    lock screen and headphone buttons still belong to RakkiPlayer, which answers them natively:
    play there resumes the song, which stops the video). Give RakkiPlayer a JS-callable switch
    to step aside (drop its remote command targets and Now Playing info) while a video plays,
    then turn on expo-video's showNowPlayingNotification with the video's title, artist and
    thumbnail (VideoSource metadata); take them back when the video stops.
- **Siri** (the user's request, 2026-10-04; backlog, not started). Wants it smart: "Play All I
  Wanted by Paramore", "Play Brand New Eyes by Paramore", "Play Brand New Eyes", best match,
  fast. Constraints and design:
  - One-sentence requests for any title ("Play X" with no app phrase) are SiriKit media
    (INPlayMediaIntent): the Siri capability needs a PAID developer account. Not possible with
    the free Apple ID + SideStore.
  - Free route (App Intents, no entitlement): one sentence for fixed commands ("Shuffle my
    library in Rakki", "Play my liked songs in Rakki", "Resume Rakki", pause, next); anything
    else in two steps: "Play in Rakki" → "What should I play?" → free-form answer (a String
    parameter with a requestValueDialog). App Shortcut entity parameters only suit a short
    list (Apple suggests ~10 suggested entities).
  - Plays in the background via AudioPlaybackIntent; instant if Rakki is running, a few seconds
    from cold. The intent (Swift, in the app target via a config plugin) hands the text to JS
    and waits for the answer; requests queue until the JS runtime is up.
  - Matching in JS on the phone with the existing fuzzy search index (server search as
    fallback): parse "X by Y" and words like album/song/playlist/"songs by"/shuffle/liked;
    phonetic + typo-tolerant matching (Siri spellings like "Paramour"); score = exact title >
    artist agreement > plays/liked; title track ambiguity → play the album from that track;
    album-only name → album; artist only → shuffle their songs, popular first. Siri answers
    "Playing <title> by <artist>", or "I couldn't find that in your library" below a
    confidence threshold.
  - With a paid account later, the same matcher would power one-sentence SiriKit requests.
- **Lyrics on the Home Screen / Lock Screen** (the user's idea, 2026-10-02; backlog, not
  started). Widgets can't animate or follow playback live, so real Spicy karaoke is out. What
  works: a timeline with one entry per lyric line at its timestamp (keeps time on its own;
  pausing or seeking needs the app to reload the timeline, and reloads are budgeted), or a Live
  Activity on the Lock Screen that the app updates line by line while it plays in the
  background (closest to live; a native build).
- **Discord Rich Presence ("Listening to …" on the user's Discord profile).** Still in the backlog (the user's call, 2026-10-02: ship 1.0.0 first). Known constraints before designing:
  - Classic Rich Presence talks to the *desktop* Discord client over local IPC. An iPhone app can't do that, and a bot can't set a user's status. Logging in with the user's own token ("self-bot") breaks Discord's terms, so that's out.
  - Most realistic route: a bridge that watches Jellyfin's sessions (Rakki already reports playback to Jellyfin, like Finamp) and sets presence through a Discord desktop client that's running somewhere, e.g. the PC. Open-source Jellyfin→Discord bridges already do this; check them first. Limitation: presence only shows while that desktop Discord is running.
  - To investigate when we get there: whether Discord's newer Social SDK (which has mobile support) allows a non-game app to set a "Listening" activity from iOS.

---

## 8. Working agreements

- **Source of truth for Spicy behaviour:** the canonical web-mod repo `OneDrive\Desktop\SpicyLyrics-Jellyfin\src` (not the stale Downloads copy).
- **Judge perf only in a release build on the iPhone.** Dev builds run JS slower and are misleading.
- Each phase gets a task list in `docs/phase-N.md` before coding starts, ticked off as it ships. Each version bump gets a `docs/CHANGELOG.md` entry.
- We borrow from Feishin and Spicy Lyrics freely (AGPL) and credit it in `NOTICE.md`.
- Commit small and keep `check.yml` green. Build a new dev client only when native deps change.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Our Swift engine has native bugs we can't see from Windows | Test on the device through SideStore; the college Mac (Xcode console) catches native crashes. |
| Expo Go can't do background audio | Expected. Expo Go is only for Phase 0; the dev build takes over in Phase 1. |
| 7-day expiry, 3-app budget, VPN juggling | SideStore auto-refresh. Keep only dev + release installed. Move to $99/TestFlight if it becomes annoying. |
| Lyric engine perf in React Native | Skia canvas plus UI-thread worklets, no per-frame React renders, 4-line window, letters only on held words. Profile in Phase 2. |
| Phone can't reach Metro away from home | Use the PC's Tailscale IP as the packager host. |
| HTTP blocked | ATS exception in `app.json` (`ios.infoPlist.NSAppTransportSecurity`). Verified in Phase 0 with the real server. |
| Scope creep ("all features") | v1 = Phases 0–4, fixed. Everything else waits. |
| College Mac locked down or has an old Xcode | It's a bonus, not a dependency: GitHub builds everything. Check the version on the first visit. |

---

## 10. Decisions

| # | Decision | Answer |
|---|---|---|
| 1 | Stack | **React Native + Expo (TypeScript)**. The user leaned this way; it also has the better real-iPhone dev loop without a Mac. |
| 2 | Signing | **Free Apple ID + SideStore**. $99/TestFlight stays an optional upgrade. |
| 3 | Repo | **Public** on GitHub (unlimited free Mac builds; no secrets in code). |
| 4 | Server access | **Login screen with a server URL field, like Finamp.** http allowed through an ATS exception. |
| 5 | Name | **Rakki** (`com.luckirakki.rakki`). |
| 6 | Versioning | **a.b.c** (the user's call, 2026-10-01): **a** = major updates with lots of new features; **b** = smaller but notable changes (backend changes, new UI elements); **c** = bug fixes and very minor things. Started at 0.7.0; 1.0.0 once the user is happy with it. `expo.version` carries it in every update; `runtimeVersion` separately names the native build (`0.2.0` = 2026-10-01, `1.0.0` = 2026-10-02) and only changes with a new native build. **1.0.0 reached 2026-10-02.** |
