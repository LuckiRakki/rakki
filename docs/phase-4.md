# Phase 4: Offline

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
- [ ] Verified on the phone (downloads can't run in the web preview).

## 4b. Offline mode — next
- [ ] Detect when the server is unreachable (no network, or Tailscale off) plus a manual
  Offline mode switch.
- [ ] Offline: screens show only what's downloaded (data hooks fall back to the downloads
  index), "Downloaded" chip in Library, search within downloads, an offline banner.
- [ ] Playback reports made offline are dropped for now (later: sync play counts).

## Exit test
In Airplane mode, downloaded albums play with lyrics.
