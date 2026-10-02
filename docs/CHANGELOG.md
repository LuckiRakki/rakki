# Rakki changelog

Versions are a.b.c (the user's scheme): **a** = major releases with lots of new features,
**b** = smaller but notable changes (backend changes, new UI elements), **c** = bug fixes and
very minor things. 1.0.0 once the user is happy with it. "Native build" is the installed app
an update needs (see FRAMEWORK.md, decision 6); everything here shipped over the air unless it
says otherwise.

## 0.12.1 (2026-10-02)
- **Japanese, Chinese, Korean (and other scripts) in Spicy lyrics.** Spicy mode draws with the
  lyrics font only, which has no Japanese, so songs like "The Cruel Angel's Thesis" showed empty
  boxes. Characters the font lacks now use an iOS system font that has them (Hiragino Sans,
  PingFang, Apple SD Gothic Neo, Thonburi…), mixed freely with the lyrics font in one line.
  Chinese and Japanese lines also wrap between characters now (they have no spaces), instead
  of running off the screen. Regular mode was never affected.

## 0.12.0 (2026-10-01)
- **Edit a station.** Long-press a station (Home or Library → Radio): *Edit station*, *Open
  website*, *Remove station*. Edit sets its name, your own picture for it (from Photos, cropped
  square) and a website; the stream stays as added. The picture shows on the station, in the
  player and on the lock screen (for SUB/WAVE: while no song cover is on air). SUB/WAVE
  stations open their own page if you don't set a website. The live player has a website
  button where the heart would be.
- **Radio lyrics (SUB/WAVE).** Lyrics now work on the station: the song on air is found in
  your library (same title and artist) and its lyrics follow what you hear. Icecast sends a
  burst of past audio when you connect (WALT: about 22 s), so you hear the station that much
  late; Rakki measures each station's burst once and offsets for it (about a second either
  way). Plain streams have no song info, so the Lyrics button is gone there.
- **Live controls.** The station's play button is a stop square: playing again reconnects, so
  it's live again (and the lyrics stay in step) instead of carrying on from where it stopped.
  The lock screen does the same (LIVE, stop, no skip or seek) from the 1.0.0 native build.
- **Lyrics button centred** under play/pause (the row is three columns now, so the sides no
  longer push it off).
- **Accent colour on radio**: with Lucid on, a station uses your own accent instead of the last
  album's colour.
- **Reorder the Library tabs.** Hold any chip (Playlists, Albums…) to drag them into your
  order, e.g. Radio before Genres. Reset puts them back.
- **Home's Radio row**: SUB/WAVE stations first, then the most recently played. Library → Radio
  can sort by *Recently played* too.

## 0.11.0 (2026-10-01)
- **Radio, with SUB/WAVE built in.** Library → Radio → *Add a station*: paste a SUB/WAVE
  station's address (e.g. its Tailscale name) and Rakki finds its name, stream and API on
  its own; any other internet radio works with its stream URL or a .pls / .m3u link. A Radio
  row on Home too (Customize can hide it).
  - The live stream plays through Rakki's engine (lock screen, background, sleep timer).
  - SUB/WAVE stations: what's on air every 10 s (song, artist, cover; the lock screen and the
    Now Playing widget follow), the show and DJ, **Request a song** to the DJ, and
    **Recently on air**.
  - The player turns into a live layout: LIVE with the show, play/pause only (no seeking,
    skipping, liking or queue). Lock screen skip reconnects the stream.
  - Radio isn't reported to Jellyfin, saved as your queue, or followed by autoplay.
- **Music videos on Home** (a row, newest first; Customize can hide it) **and in Search**
  (All results).

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
