# Rakki changelog

Versions are a.b.c (the user's scheme): **a** = major releases with lots of new features,
**b** = smaller but notable changes (backend changes, new UI elements), **c** = bug fixes and
very minor things. 1.0.0 once the user is happy with it. "Native build" is the installed app
an update needs (see FRAMEWORK.md, decision 6); everything here shipped over the air unless it
says otherwise.

## 1.5.4 (2026-10-04)
- Music video controls are see-through: frosted-glass circles with white icons (the play button
  was solid white), the loading spinner included.

## 1.5.3 (2026-10-04)
- Music videos: while one is loading (or waiting for more of the video), a spinner shows where
  the play button goes, on the video and in the mini-player, instead of a play button.

## 1.5.2 (2026-10-04)
- The music video queue picks only 3 videos ahead now (was 15) and tops up as they play.
  Settings → Playback → Music videos queued ahead changes it (1, 2, 3, 5 or 10).

## 1.5.1 (2026-10-04)
- Music video screen: the video and its title, artist and album sit centred between the top
  and Up next (no more big gap). The album is a row with the song's album cover (tap to open
  it) instead of an underlined link; without an album, just the year shows.

## 1.5.0 (2026-10-04)
- **A new look for the music video screen**: the video's colours flowing slowly behind it (like
  Now Playing's Moving background), the video as a rounded card, a cleaner title (without
  "(Official Music Video)" and the artist), and the next three videos underneath.
- **Artist and album links** on the video screen: tap an artist for their page, or the album
  (found through the matching song in your library) for the album.
- **The music video queue**: a real queue now (more by the same artist first, then other videos
  you haven't watched). Queue (on the video screen) opens all of it: what you've watched, what's
  on, and everything up next; tap one to play it, drag to reorder, remove what you don't want.
- **Swipe the video sideways** to go to the next or previous one, and new previous/next buttons
  in the controls (previous restarts the video first, like songs).
- **The controls fade properly**: they now fade a few seconds after your last tap and come back
  with a tap (they used to stay up the whole time). Full screen too.
- **Swipe up on the mini-player** to open the player (songs and videos). Swiping the video
  mini-player left or right goes through the video queue.
- **Moving background speed**: Customize → Now playing → Movement (0 is still); slower by
  default than in 1.4.0. It sets the music video screen's speed too.

## 1.4.0 (2026-10-04)
- **Music videos keep playing in the mini-player.** Swipe the video screen down (or tap the
  chevron) and it tucks into the mini-player as a small live video, with play/pause and stop;
  tap it to open the video again. Starting a song stops the video. Autoplay goes straight on to
  the next video while it's minimized.
- **Full screen fixed.** Full screen is now Rakki's own: the video turned sideways across the
  whole screen with the same controls (tap to show them) and a button back out, instead of
  Apple's full screen, which could leave you stuck with no controls.
- **The whole queue.** The queue now shows the songs already played too ("Show N songs" above
  Now playing); tap one to go back to it.
- **Moving background** for Now Playing: the cover's colours flowing slowly behind the player,
  like the Spicy Lyrics screen (Customize → Now playing → Background → Moving; the new default,
  and what Gradient switches to). Still with reduced motion.
- **Swipe the cover to skip.** Drag the Now Playing cover sideways and the next (or previous)
  song's cover slides in; let go and it skips there.

## 1.3.0 (2026-10-04)
- **Playlist pictures**: Edit playlist → tap the cover (or "Change picture") to pick a photo.
- **Search by lyrics**: type a line you remember (two words or more) and Search shows "From the
  lyrics" with the matching line under each song. The Spicy Lyrics plugin keeps the index on
  the server (every song's lyrics: sidecars, the Spicy Lyrics cache and Jellyfin's own), built
  at startup and every night, so nothing is downloaded to the phone. Needs the updated plugin.
- **Lyrics timing**: the timer button on the lyrics screen moves the song's lyrics earlier or
  later (0.1 s and 0.5 s steps), saved on this phone. **Save to server** writes it into the
  lyrics themselves: word-by-word .ttml sidecars move as a whole (via the plugin; the original
  is kept as .orig), line-by-line lyrics are rewritten and uploaded through Jellyfin. Lyrics
  from the Spicy Lyrics API can only be moved on the phone (its terms forbid keeping them).
- **Music video player**: Rakki's own controls instead of Apple's (tap to show: play/pause,
  10 s back/forward, scrubber, picture in picture, AirPlay, full screen).
- **Autoplay music videos**: when one ends, another by the same artist (or anything not watched
  yet) follows after a 5-second "Up next" (cancel or skip ahead). Settings → Playback →
  Autoplay music videos turns it off.
- **Library → Videos**: all your music videos, as a grid or a list, newest / A–Z / random.
- **Show all** on Home's Recently added (opens Albums by newest) and Music videos rows.

## 1.2.0, native build (2026-10-03)
A new app to install (SideStore). Over-the-air updates now go to this build (runtime 1.2.0);
1.0.0 stays on update 37.
- **App icon colours.** Customize → App icon: 17 palettes (Classic, Sage, Sky, Lemon, Sand,
  Lavender, Coral, Mint, Blush, Aqua, Peach, Periwinkle, Mocha, Cyan, Lime, Pink, Midnight) in
  three styles: **Liquid Glass** (iOS 26's layered look, with its own Dark, Clear and Tinted
  versions), **Depth** (flat, with the cat's shadow) and **Flat**. Neko player and Lyric lines
  are still there. Switching style keeps the colour.
- **The main icon is Classic in Liquid Glass**; older iOS versions get a flat version of it.
- **Launch screen**: the Neko player, small, on a clear background.
- From 1.0.1: the player sets its audio session before every play and never holds the display
  awake itself.

## 1.1.1 (2026-10-02)
- **Widgets: new background.** Two colours from the album cover: its brightest, most colourful
  one on top, fading into its darkest one, kept dark but in its own colour (much less black
  than before). The cover's colours come from its blurhash, so nothing extra is downloaded.
- **Lyrics credits** ("Lyrics provided by", "Synced by", "Uploaded by") are a size smaller than
  "Written by". The Discord pictures now come through: the server plugin was updated.
- **Settings → Playback → Scroll long titles**: turn the scrolling titles off (long titles are
  then cut off with "…").

## 1.1.0 (2026-10-02)
- **Long titles scroll.** In the mini-player, the player and the lyrics header, a title too
  long to fit rests, slides along until its end has come past, then rests again (still with
  Reduce Motion: cut off with "…").
- **Lyrics header links**: the title, cover and album line open the album; each artist name
  opens that artist.
- **Spicy lyrics scroll like a normal list**: a swipe keeps going and slows down (iOS's own
  deceleration) instead of stopping dead when you let go; touching stops it.
- **Lyrics credits moved into the lyrics**, after "Written by": "Lyrics provided by Spicy
  Lyrics", then who synced and who uploaded them, with their Discord picture and a tap to open
  their Spicy Lyrics profile (Spicy and Regular modes). Pictures need the updated server
  plugin. The lyrics card under the player keeps its one-line credit.
- **Opening animation**: after the launch screen the app fades in and Home's sections rise into
  place one after another (only while the app opens; not with Reduce Motion).

## 1.0.1 (2026-10-02)
- **Music no longer stops when the phone locks or you leave the app.** In the background,
  React Native runs a drawing loop (requestAnimationFrame) with no frame pacing, as fast as it
  can. The new real-level visualizer read its levels in such a loop whenever music played, so
  the CPU stayed busy and iOS killed Rakki after about a minute (its limit for background apps).
  The visualizer and Spicy lyrics now stop drawing whenever Rakki isn't on screen, and the
  progress bars stop polling too.
- **The screen sleeps as usual again**, except on the lyrics and music video screens.
  Keep-awake holds are now counted per screen with fixed tags, and cleared at launch.
- **Lock screen controls after a music video**: expo-video switched the audio session to
  "movie, mixed with other apps", which hides Rakki's lock screen controls. Closing a video
  now sets it back.
- Next native build: the player sets its audio session again before every play, and never
  holds the display awake itself.

## 1.0.0, native build (2026-10-02)
Rakki 1.0. A new app to install (SideStore), bringing everything that was waiting for a native
build. Over-the-air updates now go to this build (runtime 1.0.0); 0.2.0 stays on update 33.
- **The visualizer follows the music.** The player taps each song's audio and splits it into
  frequency bands (low to high), so the bars in the mini-player and the lyrics screen move with
  the actual sound. Songs the server transcodes (HLS) and AirPlay can't be tapped; there the
  bars keep the simulated beat.
- **Live lock screen for radio**: LIVE instead of a time bar, a stop square instead of pause, no
  skip or seek. Stopping and playing again reconnects, so it's live again.
- **Music videos play in Rakki** (expo-video): picture in picture, AirPlay, full screen in
  landscape, instead of iOS's player sheet.
- **Launch screen** shows Rakki's neko icon (it was still Expo's template logo).

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
