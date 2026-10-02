# Phase 6: Widgets

> **Status: done.** The widgets shipped in the 0.2.0 native build (2026-10-01). Kept as the record of what was built.

Goal (FRAMEWORK.md §7): Home Screen and Lock Screen widgets, like Spotify / YouTube Music.
Widgets are native (a WidgetKit extension), so they arrive with the one final build; the
app-side code ships over the air now and does nothing until that build is installed.

## How it works
- **`expo-widgets`** (Expo's own package for SDK 57) adds the widget extension at prebuild.
  Layouts are written in TypeScript with `@expo/ui/swift-ui` components and a `'widget'`
  directive (`src/widgets/layouts.tsx`). Babel turns each layout into a string; the widget
  runs it in its own small JavaScript engine to build the SwiftUI view.
- **The app feeds the widgets** (`src/widgets/index.ios.ts`): the song playing or played
  last, and Home's "Jump back in" albums. Widgets can't reach the server, so small copies of
  the album art (300–400 px; widgets have little memory) go into the app group's shared folder.
  Art files are named after Jellyfin's image tag, so changed art is fetched again; files no
  widget shows any more are removed.
- **When they update:** on a song change or play/pause (half a second later, so skipping
  quickly sends one update), on leaving the app (catches seeks), after Home's recently played
  list is fetched, and on an account switch. Updates while music plays don't count against
  iOS's widget refresh budget.
- **Live progress:** while playing, the medium widget gets the song's start and end time and
  iOS animates the progress bar by itself. A second timeline entry at the song's end switches
  it to "Last played", in case the app was closed mid-song.
- **Older builds:** everything is behind `requireOptionalNativeModule('ExpoWidgets')` and
  loaded lazily, so the current build (no widget code) is unaffected by the OTA update.

## Widgets
- [x] **Now Playing**: small (art, title, artist; playing/paused icon), medium (art, status,
  title, artist, album, progress bar), Lock Screen rectangular (status, title, artist),
  circular (icon, opens the player) and inline (title · artist). Tap opens the player.
  Before anything has played: "Play something and it shows up here".
- [x] **Jump Back In**: medium (4 albums) and large (6 albums with artists). Each album opens
  its page; the header opens the app. Background tinted from the newest album's colour.
- Live Activity: skipped. The iPhone 13 has no Dynamic Island, and the Lock Screen
  already shows Rakki's Now Playing controls (MPNowPlayingInfoCenter). Can be added later.
- Play/pause buttons on the widget: not possible with `expo-widgets` (a button runs in the
  widget, not in the app that plays the audio). The Lock Screen media controls cover it.

## Links (`src/app/+native-intent.ts`)
- [x] `rakki://player` opens the full player; `rakki://album/<id>` opens the album; `rakki://`
  just opens the app.
- [x] While the app is running they use the same helpers as taps inside it (`openPlayer`,
  `goTo` in `src/ui/nav.ts`), so the player/lyrics close first instead of the page opening
  underneath.
- [x] Cold start: an album link opens directly (Home underneath); the player link opens Home
  and then the player once the saved queue is restored.

## SideStore (free Apple ID)
- [x] **App group renaming.** App group IDs must be unique per team, so SideStore renames
  `group.com.luckirakki.rakki` to `group.com.luckirakki.rakki.<TEAMID>`. `expo-widgets` reads
  the original name from Info.plist, so our patch (`patches/expo-widgets+57.0.22.patch`,
  applied by `patch-package` on install) uses the renamed group when SideStore lists it
  (`ALTAppGroups` in the app's Info.plist, or the provisioning profile's entitlements).
- [x] **Entitlements in the build.** SideStore learns which app group to register from each
  binary's entitlements, and an unsigned build has none. The iOS workflow now signs ad hoc with
  the entitlements (frameworks, then the widget extension, then the app) and prints them.
- [x] **No push entitlement.** `expo-widgets` adds `aps-environment` even with push off, and a
  free Apple ID can't have it. Patched to respect `enablePushNotifications`; the build also
  strips it before signing.
- [x] **Optimized widget.** `expo-widgets` gives the widget target the same settings for Debug
  and Release (`-Onone`, so Xcode also bundles a 7 MB debug dylib). Patched: Release builds with
  `-O`, whole module, no debug dylib (widgets have little memory).
- [x] **App IDs:** the widget extension takes one more of the free account's 10 App IDs per
  week (Rakki + widgets = 2). If SideStore asks whether to keep app extensions, keep them.

## Build
- [x] `ios.yml` has a new **check** variant: the release build without publishing, to make
  sure native changes compile while the downloadable build stays as it is.
- [x] Compile check on CI (branch `phase-6-widgets`), 2026-10-01: four check builds passed
  (widgets; + Photos picker and backup exclusion; + no push entitlement), then a fourth with the
  optimized widget (one 7 MB binary, no debug dylib). Inspected the .ipa:
  `ExpoWidgetsTarget.appex` with the widget runtime bundle, bundle ID
  `com.luckirakki.rakki.ExpoWidgetsTarget`, app group on both, `rakki` URL scheme, Photos
  permission only (no camera/microphone), iOS 16.4 minimum.
- [x] Installed on the phone (0.2.0, 2026-10-01) and checked by the user.

## Other items for the final build (done alongside)
- [x] **Photos picker** for the profile picture (`expo-image-picker`, `src/auth/profile.ts`):
  pick a photo, crop it square, uploaded as JPEG. No camera or microphone permission is added.
  Builds before 0.2.0 keep the Files picker.
- [x] **Downloads out of iCloud backup**: a native `excludeFromBackup` in our RakkiAudio module;
  `Documents/Music` and `Documents/.rakki` are marked on launch (everything in them can be
  downloaded again).
- [x] **App icons** (2026-10-01): the main icon is the user's own neko silhouette (orange, black
  cat girl with an iPod and wired earbuds, `assets/icons/rakki.png`). Two alternates designed
  with the user: **Neko player** (a white player with cat ears and a happy face on the screen)
  and **Lyric lines** (the lyrics line mid-sweep). Sources in `assets/icons/source/`.
- [x] **Switch icons in the app**: Customize → App icon (`src/ui/AppIconPicker.tsx`,
  `src/lib/appIcon.ts`) via `expo-alternate-app-icons` (icons in the asset catalog plus
  `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`). iOS confirms a switch with its own alert.
  Hidden on builds without it.
- [x] **Version 0.2.0**, bumped for the release build. The OTA channel follows the app version,
  so updates from here on reach 0.2.0 only; the 0.1.0 app keeps what it has.
- Already in the config: the Files app folder (`UIFileSharingEnabled`,
  `LSSupportsOpeningDocumentsInPlace`).

## Testing done
- Typecheck and lint clean.
- The layouts were run through Expo's real widget runtime (built locally from
  `expo-widgets/bundle`) in Node: every size, playing/paused/empty, renders a valid SwiftUI
  tree with no errors. The look itself can only be checked on the phone.
