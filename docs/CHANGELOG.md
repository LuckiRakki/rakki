# Rakki changelog

Versions are a.b.c (the user's scheme): **a** = major releases with lots of new features,
**b** = smaller but notable changes (backend changes, new UI elements), **c** = bug fixes and
very minor things. 1.0.0 once the user is happy with it. "Native build" is the installed app
an update needs (see FRAMEWORK.md, decision 6); everything here shipped over the air unless it
says otherwise.

## 0.10.0 (2026-10-01)
- **Music videos.** Videos from Jellyfin's Music Videos library are matched to songs by
  artist and title ("CONFETTI - ARMY STYLE (OFFICIAL MUSIC VIDEO)" finds "army style"):
  - a **Video** button next to Lyrics in the player when the song has one;
  - **Watch music video** in the song's menu;
  - a **Music videos** row on the artist's page.
  The song pauses while the video plays. MP4/MOV with H.264/HEVC plays as it is; anything else
  (WebM, AV1, MKV…) is converted by the server to 720p H.264 on the fly. This build opens videos
  in iOS's own player; the in-app player (picture in picture, AirPlay, full screen in
  landscape) comes with the next native build (expo-video).
- **Last.fm plays on albums**: each song's worldwide plays under it ("Frank Ocean · 1.2M
  plays"), looked up three at a time and kept a week. Settings → Last.fm → Plays on albums
  turns it off.

## 0.9.0 (2026-10-01)
- **Artist pages: Popular sorted your way.** A sort control on Popular: *Popular worldwide
  (Last.fm)*, with each song's play count from Last.fm, or *My plays*, with your own play
  counts. Last.fm needs your free API key in Settings → Last.fm (kept on the phone); its counts
  are kept for a week. Songs are matched to Last.fm by title, so only songs you have show up.
- **Artist pages: Show all** on Discography and on Singles and EPs when there are more than 3,
  opening the full list (year and Single/EP/Album under each).
- **Library: Genres tab**, as tiles or a list, sorted by most albums, A–Z or random. Offline it
  lists the genres of your downloaded albums.
- **Visualizer**: small bars in the mini-player while a song plays (Customize → Mini-player →
  Visualizer). In the lyrics screen, a song without lyrics says so, then fades to a full
  visualizer after a second; the bar-chart button at the top shows the visualizer for songs
  with lyrics too. The bars move with a beat but don't follow the actual sound yet (that needs
  an audio tap in a future native build).
- **Lyrics: Up next.** In the last 15 seconds of a song, the next one slides up above the
  controls; tap it for the queue.

## 0.8.0 (2026-10-01)
- **Offline listens count.** Songs played offline (90% or more) are kept and sent to Jellyfin
  when the server is back, with the time you played them, so play counts and Recently played
  catch up.

## 0.7.0 (2026-10-01)
- About shows the real version (it said 0.1.0 and "update [object Object]").
- The a.b.c versioning starts; updates now carry their own version.
- Housekeeping: notes ticked, stale comment fixed, merged branch removed.

## 0.2.0, native build (2026-10-01)
- Widgets (Now Playing, Jump Back In, Lock Screen), app icons with a picker in Customize
  (the neko, Neko player, Lyric lines), Photos picker for the profile picture, downloads in the
  Files app, downloads kept out of iCloud backup.
