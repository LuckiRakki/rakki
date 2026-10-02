# Phase 4: Offline

> **Status: done** (2026-10-01; downloads and offline mode confirmed on the phone). Kept as the record of what was built.

Goal (FRAMEWORK.md §7): in Airplane mode, downloaded albums play with lyrics.

Checked before starting (2026-10-01):
- The installed release build (2e94740, app 0.1.0) already has expo-file-system 57.0.7 (with
  background `DownloadTask`s, iOS background URLSession by default), expo-sqlite and
  expo-network. **All of Phase 4 ships over the air; no new .ipa.**
- Library formats (2,000-song sample): 81% MP3, 19% FLAC, <1% M4A, all playable by iOS as-is.
- Jellyfin download URLs: original = `/Audio/{id}/stream?static=true` (has Content-Length,
  so real progress). Converted = `/Audio/{id}/stream.m4a?AudioCodec=aac&AudioBitRate=…`
  (a proper M4A; no Content-Length, so progress is estimated from bitrate × duration). One FLAC:
  26.3 MB original vs 7.4 MB as 256 kbps AAC.
- No API to exclude files from iCloud backup without native code; files live in
  Documents/downloads (never purged by iOS). Backup exclusion goes in the Phase 6 native build.

## 4a. Downloads — built 2026-10-01
- [x] `src/downloads/`: files.ts (paths), store.ts (what's downloaded, per user, kv-store,
  batched saves; live progress in memory), manager.ts (queue, 2 at a time, Wi-Fi rule,
  resume after restart, playlist/Liked sync, garbage collection of unneeded files/art).
- [x] Collections: album, playlist, Liked Songs, single song. A song shared by several stays
  until none need it. Downloaded playlists and Liked Songs follow changes (on launch, and right
  after a like/unlike).
- [x] Download quality (Settings): Original / High (256 AAC) / Normal (128 AAC) for lossless
  files; compressed files always kept as-is; anything iOS can't play (or unknown) is converted.
- [x] "Download using cellular" (off by default: downloads wait for Wi-Fi).
- [x] Local-first playback (player uses file:// when downloaded, also for lock-screen art).
- [x] Lyrics saved with downloads: our TTML sidecars (no `source`) and Jellyfin's LRC. API
  lyrics are never stored (Spicy Lyrics API terms). `useLyrics` reads the saved copy first.
- [x] Cover art saved for downloaded albums/playlists and each song's album; `Artwork` uses it.
- [x] UI: download toggle with progress ring on album / playlist / Liked Songs pages; Download /
  Remove download in the long-press menu; accent arrow on downloaded songs; Settings →
  Downloads (quality, cellular, Manage downloads); Downloads screen (sizes, free space, retry,
  remove, remove all).
- [x] Readable files (user asked 2026-10-01 to see them in the Files app): songs saved as
  Documents/Music/<Artist>/<Album>/<01 Title>.<ext>; Rakki's art/lyrics in hidden
  Documents/.rakki/; update 16's flat `downloads/<id>` layout is migrated on launch. Empty
  Artist/Album folders are removed with their last song.
- [x] Library → "Downloaded" chip: downloaded albums, playlists, Liked Songs (with progress),
  then single songs; sort (Recently downloaded / Alphabetical) and grid/list.
- [x] Files app folder ("On My iPhone → Rakki"): `UIFileSharingEnabled` +
  `LSSupportsOpeningDocumentsInPlace` in Info.plist, live since the 0.2.0 native build.
  Deleting/moving files there makes Rakki re-download them.
- [x] Verified on the phone by the user (2026-10-01: "it's clean").

## 4b. Offline mode — built 2026-10-01
- [x] `src/lib/online.ts`: offline = Offline mode switch, no connection, or the server not
  answering `/System/Ping` (e.g. Tailscale off). Pinged at sign-in, on connection changes, on
  app foreground, after a failed request, and every 30 s while unreachable.
- [x] Signed-in requests fail at once while offline (no 15 s timeouts against an unreachable
  Tailscale address).
- [x] Data hooks fall back to the downloads (`src/downloads/offline.ts`): Home (quick picks =
  downloaded albums, Artists you play), Library tabs, album/playlist/artist/genre pages, Liked
  Songs, Search (fuzzy over downloads). Partly downloaded albums/artists show the songs you
  have. Cache keys carry online/offline (+ downloads revision), so data never mixes.
- [x] "Not available offline" page for things with nothing downloaded; songs not on the phone
  are greyed out; the player only queues downloaded songs offline.
- [x] Offline bar above the mini player (why + "Playing downloads only"; tap to re-check).
- [x] Offline hides server-only actions (like, add to playlist, radio, rename/delete, create
  playlist, edit playlist, new downloads).
- [x] Downloads pause offline and resume (plus playlist sync) when the server is back.
- [x] Offline listens (0.8.0): a song that counts as played (90% or the whole of it) but couldn't
  be reported is kept per account and sent when the server is back, as "mark played" with the
  date it happened, so play counts and Recently played catch up (`src/player/offlineListens.ts`).
  Last.fm scrobbles via the server plugin only see live playback, so they don't get these.
- [x] Verified on the phone (the user moved on to Phase 5, 2026-10-01).

## Exit test
In Airplane mode, downloaded albums play with lyrics.
