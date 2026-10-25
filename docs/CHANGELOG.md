# Rakki changelog

Versions are a.b.c (the user's scheme): **a** = major releases with lots of new features,
**b** = smaller but notable changes (backend changes, new UI elements), **c** = bug fixes and
very minor things. 1.0.0 once the user is happy with it. "Native build" is the installed app
an update needs (see FRAMEWORK.md, decision 6); everything here shipped over the air unless it
says otherwise.

## Desktop 1.4.0 (2026-10-25, next desktop build; needs the Rakki plugin 0.3)
- **Edit Audio** (right-click a song). Drag where the song starts and ends on its waveform, fade
  it in and out, make it louder or quieter, shape it with a ten-band equalizer (or a preset), and
  change its speed, pitch and reverb (Slowed + Reverb and Sped Up are one click). While the song
  plays you hear each change as you make it; Save keeps it. The edits live with the Rakki plugin
  on your server, never in the music file, so the song plays that way on every Rakki and the file
  stays as it was.
- **Sync Lyrics** (right-click a song, or the Sync Lyrics button when a song has no lyrics or only
  plain ones). Paste the words (or start from the lyrics the song has on your server), pick line
  by line or word by word, then tap Space along with the song. Check every line after, nudge it
  by a tenth of a second or tap again from there, and save: the plugin keeps them apart from your
  files and every Rakki shows them, crediting you. Lyrics from the Spicy Lyrics API are never
  copied in (its terms only allow showing them).
- **Keyboard shortcuts you can change** (Settings → Shortcuts): click one and press new keys,
  give an action up to three, or go back to the defaults.
- **Discord buttons.** Your status can show a Listen button (the song on song.link, which has it
  on every music service) and a Rakki on GitHub button, each switchable. Settings shows what your
  friends see, since Discord never shows you your own buttons.
- **Text boxes in Kawarp are dark wells**, so what you type and the hints in them read on any
  cover (they were pale glass, and the hints nearly vanished on bright covers). Hints in text
  boxes read better in every theme too.
- **Server (Rakki plugin 0.3):** keeps audio edits and made lyrics in its own data folder, never
  in the music files; made lyrics are served first and found by lyrics search.

## Desktop 1.3.1 (2026-10-25, next desktop build)
- **Edit Metadata shows the Spotify links your songs already have.** They were saved but came
  up empty when you opened it again (Rakki misread how MRQ lists a file's tags). Now every song
  row, and a single song's Spotify Link field, shows its link.
- **The album editor remembers the album link** you filled the songs from, so it's there next
  time (on this computer; the files themselves only hold each song's link).

## Desktop 1.3.0 (2026-10-23, next desktop build)
- **Spotify links in Edit Metadata.** One song has a Spotify Link field (paste Share → Copy Song
  Link); MRQ writes it to the file's tags and the .spotify file Spicy Lyrics reads. The field shows
  the link the file already has.
- **Editing a whole album is its own screen** (right-click an album → Edit Metadata). The album's
  fields once (album, album artists, genres, year, cover), then a row per song with its number,
  title, artists and Spotify link, all editable together and saved in one go.
- **Paste the album's Spotify link to fill in every song's.** Rakki reads the album's public page
  on Spotify, matches its songs to yours by title (else by place in the album) and fills the
  links in for you to check before saving.
- **Fix:** the connection to MRQ could close the app if it was used before the update check had
  run (its encryption wasn't set up yet); it sets it up itself now.

## Desktop 1.2.1 (2026-10-21, next desktop build)
- **Kawarp, a new theme:** the whole app over the playing cover flowing like liquid, as on the
  Spicy Lyrics screen (Settings → Look → Theme). The panels are nearly clear, with white text
  and frosted cards, menus and dialogs. Settings → Look → Backgrounds sets how lively it is and
  whether it moves with the music, and it holds still while paused or in the tray. With Kawarp
  on, the lyrics in the main area sit on the same flow instead of drawing a second one.

## Desktop 1.2.0 (2026-10-21, desktop build)
- **Themes, like Spicetify, from a file.** Settings → Look → Theme lists Rakki (the default
  look), Lucid, and themes you import. A theme is one .css file (Import; importing an edited
  file with the same name updates it): its first comment names it, and it can put the playing
  cover behind the whole window, blurred, with the panels see-through over it. How to make one
  is in docs/THEMES.md. The colours a theme sets on :root are the part the phone app will use
  when themes come there.
- **Lucid, the first theme:** Rakki in the look of the Lucid Spicetify theme as it's set up on
  your Spotify (by Sachu/sanoojes; rewritten for Rakki): the cover behind everything (blur 32,
  saturation 150%, brightness 40%), see-through panels tinted by the album with a thin light
  border, Home's top band in the album's colour, glass menus and dialogs.
- **Lyrics fill the main area.** The Lyrics button now puts big lyrics (Spicy word by word, or
  Regular) in place of the page, over the cover flowing in its colours, like Spotify with Spicy
  Lyrics; both sidebars stay, and the right one drops its lyrics card while they're open. Press
  Lyrics again, Esc or Back, or open any page, to get the page back. Lyrics Settings and Full
  Screen Lyrics show at the top right on hover; the Next up card at the end opens the queue. In
  the full player, Lyrics still switches to its lyrics tab.
- Includes 1.1.0 below (Edit Metadata through MRQ), which wasn't built on its own.

## Desktop 1.1.0 (2026-10-21)
- **Edit Metadata through MRQ.** Put your Music Review Queue's address in Settings → Connections
  → MRQ (Test shows its version). Then right-click a song, several songs or an album and pick
  Edit Metadata to change the title, artists, album, album artists, genres, year, track and disc
  numbers, or the cover, in the files themselves. Several songs at once work like MRQ's Tag
  Editor: a field they disagree on says how many values it has and is left alone unless you type
  in it. MRQ writes the files (its undo history has the change), then Rakki asks Jellyfin to read
  them again, so the new names show in a few seconds. Needs a Jellyfin administrator sign-in
  (only they see where files are). The desktop reaches MRQ through its native side, so MRQ
  itself needs no change.

## 1.22.2 (2026-10-21)
- **Less memory in the background, so iOS closes Rakki less.** The performance log showed iOS
  closing Rakki in the background for memory 10 times on 10-20, with 150-200 MB held while
  suspended. Pictures that didn't go through the usual artwork (library and video thumbnails,
  radio covers and DJs, station art, your profile picture, lyrics credits) now let go of their
  memory in the background like the artwork does, and so do the full-screen blurs (the moving
  player background, the Spicy lyrics backdrop and the Glass mini player). Their colours hold
  the place, and everything comes back from the disk cache when you return.

## 1.22.1 (2026-10-21)
- **Spicy lyrics: a crash fix and less work per frame** (from the Oct 18-21 performance logs).
  The phone closed once right after a few minutes on the lyrics screen (a memory crash in native
  code, called from JavaScript); old lyric pictures were freed from JavaScript while the screen
  could still be drawing them, and are now freed on the drawing thread. The lyrics screen also ran
  at about 50% CPU with 17-45 garbage collections a second: the colour sweep built two colour
  strings and a gradient for every lit word on every frame, and the edge fade a new paint and
  gradient every frame. Sung words are now a flat colour, the sweep reuses its colour stops and
  frees each gradient as soon as it's replaced, and the edge fade is built once.

## 1.22.0 (2026-10-21)
- **The lyrics screen is only the lyrics.** The artwork, the song and the lyrics, with Close and
  one Lyrics Style button at the top. The visualizer, the timing button and Spicy / Regular
  moved into Lyrics Style (opened from the lyrics, it has a Lyrics Screen section: Visualizer,
  Play Controls and Lyrics Timing; Spicy / Regular is "Lyrics open in"). Previous, play / pause
  and next under the lyrics are off unless you turn on Play Controls there.
- **Desktop: the Lyrics button stays in the player bar** (next desktop build). After a music video
  or controlling another device the bar could think the window was narrow and tuck Lyrics (and
  Now Playing View) into the More menu for good; it measures itself properly now, and Lyrics
  never moves to the menu even in a narrow window.
- **Desktop: "No Lyrics Found"** when you hover the Lyrics button (in the player bar and the full
  player) on a song without lyrics.
- **Desktop: full screen is only the artwork, the song and the lyrics.** No player bar, tabs or
  buttons; Exit Full Screen shows at the top while the mouse moves, and Esc or F11 still leave.
  A song without lyrics shows its artwork and title alone, centred.

## 1.21.1 (2026-10-21)
- **Search never waits.** Results show as you type from what Rakki already has (songs, albums,
  artists and playlists the pages loaded, your downloads, genres) while the full search asks the
  server, and stay if the server is slow or doesn't answer. On the desktop a line says when
  you're seeing these quick results.
- **The search index builds itself on the desktop.** Shortly after launch, then every so often
  and when you come back to the window, instead of only once you open Search. While it downloads
  the library it steps aside whenever you search, so your search is answered first.

## 1.21.0 (2026-10-21)
- **Volume in the remote player.** While the phone controls Rakki on your computer, the player
  has a volume slider under the controls that sets the computer's volume as you drag. It starts
  where the computer's volume really is (the next desktop build reports its volume to your other
  devices; until then it starts at 80).
- **The desktop's remote volume follows the other device too** (next desktop build): the slider
  in its "Listening on" bar shows the device's real volume instead of always starting at 80.

## 1.20.3 (2026-10-21)
- **Widgets show album art on Clear and Tinted Home Screens.** iOS drew the covers as a flat tint
  there, so they looked empty; now the Now Playing and Jump Back In covers stay in full colour.

## 1.20.2 (2026-10-20)
- **The heart is solid when a song is in any of your playlists**, not only in Liked Songs, in the
  player and the remote player (like the desktop and the song lists). Tapping it on a song that's
  only in playlists opens where it's saved.
- **The remote player keeps time with the other device.** It ran 6-7 seconds ahead because it
  went by the server's clock; now it times the device's reports by the phone's own clock, so it
  settles to within about a second after the first update.

## 1.20.1 (2026-10-20)
- **Pick songs for the other device.** While the phone controls Rakki on your computer, tapping
  a song, album, playlist or Shuffle anywhere plays it there and the phone stays its remote. Play
  Next and Add to Queue add to the computer's queue (that part needs the next desktop build).
- **The heart works in the remote player.** It shows whether you really liked the song (the
  server's session doesn't say, so Rakki asks), and holding it adds the song to a playlist.
- **The progress bar stays on screen.** Between the other device's updates the place is a guess,
  and it no longer runs past the end of the song (or ahead when the clocks disagree).

## 1.20.0 (2026-10-20)
- **The phone becomes a remote, like Spotify Connect.** Move your music to Rakki on your computer
  (or, with nothing playing here, tap a device in Connect that's playing) and the mini player and
  the player show that device's song and where it is in it, with "Listening on {device}" in the
  accent colour. Play, pause, skip, go back and seek all happen on the computer. Tap "Listening
  on" to open Connect; This Phone brings the music back. Playing something on the phone, or the
  computer closing Rakki, makes the phone the player again.

## 1.19.1 (2026-10-15)
- **Next Up looks like the desktop's.** The next song's cover, "Next Up", its title and artist,
  straight on the lyrics' background instead of a dark box, and it floats up once the singing is
  over as well as in the last 15 seconds.

## 1.19.0 (2026-10-15)
- **Radio stations on every Rakki.** Your stations are kept on your server by the Rakki plugin
  (it needs plugin 0.2), so Rakki on your computer has the same list; adding, renaming or
  removing one shows up on the others. The first time, the phone's stations and the server's
  are joined (none are lost). A station's own picture stays on the device it was set on.

## 1.18.0 (2026-10-14)
- **Connect, like Spotify's.** The devices button in the player opens a simple list: This
  Phone and your other Rakki apps, the one playing lit. Tap a device to listen there (the
  music moves over at the same moment in the song); tap This Phone to bring it back. The
  separate Play here / Play there buttons and the small controls are gone.

## 1.17.2 (2026-10-13)
- **Your devices: bigger buttons.** Previous, play / pause, next and Play here / Play there are
  now full-size touch targets (44 pt), and moving music closes the screen at once; a message
  says when it's playing on the other side (or why not).
- **Readable colours.** Lucid accents from strong blues and purples are lightened until they
  read on Rakki's dark surfaces, and genre tiles from yellow and green art are darkened until
  their white names read.

## 1.17.1 (2026-10-13)
- **Fixed: two songs at once after the lock screen or Control Center buttons.** Restart now
  (after an update downloads) reloads Rakki in place, and the player from before could stay
  behind, paused but still answering the iOS buttons, so resume or skip woke it alongside the
  new one. Rakki now stops its player and lets go of those buttons before it reloads. (The next
  native build also makes sure only one player can exist.) If it happens now, close Rakki from
  the app switcher once.

## 1.17.0 (2026-10-13)
- **Your devices on the phone**: the laptop button next to AirPlay in the player lists your other
  Rakki apps (the computer) and what each is playing. Control one from there (previous, play /
  pause, next), take its music over ("Play here"), or send the phone's music to it ("Play
  there"), at the same moment in the song.
- Coming back to Rakki reconnects to your server's live connection at once, so the computer can
  control the phone again right away.

## 1.16.0 (2026-10-13)
- **Rakki on your computer can control the phone and move music between them** (playing
  across devices, phases 2 and 3). The phone listens on your server's live connection while
  Rakki is open or playing, and does what the desktop asks: play these songs from here, pause,
  resume, skip, seek, repeat, shuffle. "Play here" on the desktop takes over what the phone is
  playing at the same moment (the phone pauses); "Play on phone" sends the desktop's queue to
  the phone. A stopped phone keeps its queue (it pauses).

## 1.15.2 (2026-10-12)
- The list of your other Rakki apps (the desktop's Devices button) now finds the phone: it
  asked the server only for apps that accept remote control, which Rakki doesn't yet.

## 1.15.1 (2026-10-12)
- Rakki now tells your server what it can play and sends the queue around the song with its
  playback reports, so **Rakki on your computer can see what your phone is playing** (its
  Devices button). The first step of playing across devices (docs/REMOTE_PLAYBACK.md); nothing
  changes on the phone itself yet.

## 1.15.0, native build (2026-10-11)
A new `.ipa` (runtime 1.15.0): install it with SideStore. Older installs stay on 1.14.2.
- **About half the size.** App icons were 92 of its 181 MB, so the app now carries Classic,
  Lavender and Midnight (Liquid Glass, Depth and Flat) plus Neko player and Lyric lines.
  Customize → App icon → **More colours** links to the other 14 as images, with how to make
  one your Home Screen icon through a Shortcuts shortcut (docs/ICONS.md).
- **Music videos turn with the phone**: hold it sideways on the video screen and the video
  fills the screen, controls and all, no full-screen button needed. Every other screen stays
  upright.
- **Music videos own the lock screen natively**: while one plays, the music player gives up its
  lock screen, Control Center and headphone buttons entirely, and takes them back after.
- **Performance log: data per song** (what each streamed song pulled off the network).
- Songs that end on their own are now let go of properly (their visualizer tap and bookkeeping
  stayed behind before, a little memory per song played).
- Updated Reanimated (4.5.5) and Expo patches: two of the crash reports were inside Reanimated.

## 1.14.2 (2026-10-11)
- Fewer crashes: Spicy lyrics drew a new picture every frame and left the old ones for the
  garbage collector, which can't see their (native) size, so memory could pile up until an
  allocation failed (the crash reports: Skia running out of memory in drawText, React failing
  to create a view, often right as you switched Spicy and Regular). Old pictures are now freed
  as soon as the screen can't be showing them.

## 1.14.1 (2026-10-11)
- Performance log: CPU readings no longer come from sub-second windows (a sample taken right as
  the app changed state read as 500-1000 %), and the summary averages CPU by time instead of
  by sample. Re-scored, the last day's background CPU was 0-1 %.

## 1.14.0 (2026-10-11)
- Fixed: scrolling Recent searches closed it (scrolling hides the keyboard, which used to end
  search mode). Search mode now lasts until Cancel.
- README: new screenshots and demo GIFs, a lyrics setup guide (local .ttml files and the Spicy
  Lyrics API), how caching and the nightly server tasks work, widgets, and why CarPlay isn't
  here yet.

## 1.13.0 (2026-10-11)
- **Library → Mixes**: your Daily Mixes as a Library tab (hold the chips to move it), and
  "Show all" on Home's "Your Daily Mixes" opens it.
- Daily Mixes: at most 3 songs from one album per mix (the plugin's "Most songs from one album"
  setting), covers with the lead artist's photo and a stripe in the artist's colour.

## 1.12.0 (2026-10-11)
- **Daily Mixes** arrive: the Rakki plugin writes them to "[Rakki] Daily Mix 1" to "6" every
  night at 12 AM (or now, with Publish on the plugin's page). Home has a "Your Daily Mixes"
  shelf (move it in Customize Home); each shows as "Daily Mix N" with its lead artists.
- Mixes stay out of Library → Playlists, Home's "Your playlists", Add to playlist, search and
  the "in a playlist" heart.

## 1.11.1 (2026-10-11)
- Sign-in screen tagline no longer uses the Spicy Lyrics name (its API Terms keep it out of
  app names and listings); the README and banners say plainly that the lyrics look is an
  unofficial port.

## 1.11.0 (2026-10-11)
- With the Rakki plugin on the server, the playlist cache (Add to playlist's ticks, the
  "in a playlist" heart) stays in step with one request instead of one per changed playlist.
- The Rakki plugin now holds the lyrics too (it replaces the Spicy Lyrics TTML plugin on the
  server), notes skips for Daily Mixes, and shows the performance logs on its settings page.

## 1.10.0 (2026-10-10)
- The Rakki companion plugin (server/, for the server; Daily Mix preview so far) shares the
  Last.fm key with the app: whichever has one fills in the other, so you only enter it once.
  Changing it in Settings → Last.fm updates the server too (administrators only).

## 1.9.2 (2026-10-10)
- Library button: tapping it while you're already in Library goes to its first tab (instead
  of a double tap).

## 1.9.1 (2026-10-10)
- **Fixed: music coming back 25 songs ahead after a video.** While a video held the music, the
  emptied player's events and the smart queue (which added a batch of 25) moved the queue on.
  Now nothing touches the music while a video is on, and it comes back on exactly the song and
  second it was on.
- **Fixed: the lock screen showing the last song when a video starts.** The music now lets go
  before the video starts, so the video's title and picture are there from the first moment.
- **Tap Library while you're in it** to jump to its first tab (since 1.9.2; 1.9.1 needed a
  double tap).

## 1.9.0 (2026-10-10)
- **Music videos own the lock screen.** (The user's idea: the music player stayed loaded under
  the video, and both answered the lock screen's buttons.) While a video plays, the music
  player now lets go completely: your queue stays in the app, the player itself is emptied,
  and the lock screen, Control Center and headphone buttons show and control the video (title,
  artist, thumbnail). When the video ends, the music comes back paused where it was; pressing
  play, next or a song brings it back at once. Needs testing on the phone: if iOS still shows
  the song, the full fix comes with the next native build.
- **Lighter in the background, same place when you're back.** While Rakki is in the
  background, the heavy parts let go of their memory: album pictures (a flat colour from each
  picture holds its place), the moving backgrounds, the blurred player background, the artist
  photo and the lyrics' drawing surface. Every screen, list and scroll position stays, and the
  pictures come back from the phone's cache when you return.

## 1.8.0 (2026-10-10)
- **Add to playlist saves in the background.** Done closes the sheet at once; the saving
  carries on while you use the app, and "Added to …" shows when it's finished (or an error).
- **The shuffle button is a toggle** on albums, playlists, Liked Songs and genres (and it's the
  same switch as the player's): while it's on, Play plays shuffled. **New queues no longer
  start shuffled** just because an earlier one was: only the toggle decides (one-off buttons
  like an artist's Shuffle or Shuffle all songs shuffle just that queue).
- **Sort a playlist:** Custom order, Recently added, Title, Artist, Album, Length or Random
  (Play follows it; remembered).
- **The heart shows for songs in any of your playlists**, not only liked ones.
- **Swipe down to close the lyrics** from the header or the controls: the screen follows your
  finger like the player, with the app showing behind it.
- **Less memory in the background:** long lists keep fewer rows (and their pictures) ready off
  screen (iOS was still closing Rakki 8 to 20 times a day in the background, most often when
  it was left on an artist page, a playlist or a video).
- **Performance log: data use.** Each upload now shows what Rakki downloaded from the server
  (API answers and downloaded songs) and iOS's own Wi-Fi and cellular totals per day (which
  include streaming).

## 1.7.1 (2026-10-07)
- **Add to playlist opens instantly.** Which songs each playlist has is now kept on the phone,
  so the ticks are there straight away. It stays in step with the server: one cheap request
  (every playlist's song count and Jellyfin's change stamp) finds the playlists that changed,
  and only those are fetched again, at launch, when Rakki comes back to the front, every 15
  minutes while it's open, and each time Add to playlist opens. Every change Rakki makes to a
  playlist (from anywhere) updates it right away, a playlist page you open refreshes it too,
  and every playlist is fetched in full every 6 hours regardless. Saving never relies on it:
  Done reads the playlists it changes from the server first.

## 1.7.0 (2026-10-07)
From the performance log's first full day on the 1.6.3 build (iOS's own reports included):
- **Fixed: the two crashes and iOS closing Rakki in the background.** Both crashes died in the
  memory allocator, and iOS closed Rakki 14 times in a day for "memory pressure". Memory
  jumped by 140 MB whenever Add to playlist opened: it downloaded every playlist in full
  (about 3,400 songs with all their details) just to place the ticks. It now asks each
  playlist only which songs it has. Rakki also gives memory back when it goes to the
  background (decoded pictures, cached answers no screen is showing) and when iOS warns.
- **Fixed: Add to playlist missing playlists a song is in, and not reacting to taps.** Big
  playlists (like UpbeatRingers, 595 songs) could time out, so they looked like they didn't
  have the song; and nothing could be ticked until every playlist had answered. Each playlist
  now shows its tick as soon as it answers (a spinner until then), rows can be ticked straight
  away, and Done checks what each changed playlist really has before saving.
- **Battery: the moving backgrounds.** iOS counted 10,400 seconds of GPU time in a day against
  45 minutes on screen. The flowing covers moved 60 times a second, and every move made the
  live blur over them redraw; they move 12 times a second now (it looks the same, the motion is
  slow), and stop while another screen covers them (the player under the lyrics, say).
- **Battery: the lyrics screen** stops drawing while paused once everything has settled (it was
  ~50% CPU drawing the same frame), and no longer makes a new recorder every frame.
- **Offline mode less jumpy.** One missed check (moving between Wi-Fi and cellular, Tailscale
  reconnecting) no longer switches Rakki offline: it asks again first, gives a new network a
  moment to settle, and checks back sooner when the server really was gone (5, 10, 20 s, then
  every 30 s).
- **Search in Library:** the magnifier next to Sort searches the tab you're on: Playlists,
  Albums, Songs, Artists, Genres, Videos, Radio and Downloaded (Albums, Songs and Artists ask
  the server, so it finds everything, not just what's loaded).
- **Find in playlist** (and in Liked Songs): narrow the songs down; tapping one still plays the
  whole playlist from there.
- **Playlist and album length in hours and minutes:** "595 songs, 35 hr 34 min".

## 1.6.3, native build (2026-10-06)
A new app to install (SideStore), needed because 1.6.2 closed the app right after the launch
screen, and an update can't reach an app that closes before it checks for one. Over-the-air
updates now go to this build (runtime 1.6.3).
- **Fixed: Rakki closing at launch (1.6.2).** The artist-picture fix read an artist's name in a
  way the React Compiler evaluates while drawing, so every album cover without an artist threw.
  The same pattern is gone from the music video and radio code too.
- **No more closing on a drawing error.** If a screen ever throws, Rakki shows the error with
  a Try again button instead of closing, and sends it to your server's log.
- **Performance log hardware readings:** CPU load, memory, heat, battery, Low Power Mode and
  brightness in every sample, plus iOS's daily MetricKit reports.

## 1.6.2 (2026-10-06)
- Artist pictures and backdrops show even when Jellyfin has the artist twice (their music
  folder, plus an entry it made from the songs' tags). Songs link to the copy without the
  pictures; Rakki now borrows them from the other one, on the artist page and in lists.

## 1.6.1 (2026-10-06)
- Opening Home: shelves still loading from the server rise into place when they arrive, like
  the top two, instead of popping in, and the shelves below glide down to make room.

## 1.6.0 (2026-10-06)
- **Smart queue.** Autoplay (when the queue runs out) and song/artist radio now pick songs the
  way Spotify does: what Last.fm listeners play alongside the songs you're hearing, popular
  songs by the artists they like next, your own likes and most played by those artists, and
  Jellyfin's instant mix. Each song is scored on how alike it is, how much the world plays it
  and how much you do; songs you heard in the last few hours wait their turn, the same song
  from two albums only comes once, an artist never plays twice in a row, and songs you know
  take turns with ones you don't. It gives itself 6.5 seconds for answers (about half a
  second with them saved), so it's always done well inside 11. Without a Last.fm key it uses
  your plays and Jellyfin's mix.
- **Radio starts at once.** Song radio plays the song straight away and an artist's radio their
  top song; the queue fills in behind it (it used to wait for the whole mix first).
- **The screen stays on while a music video plays**, wherever it's showing (the mini-player
  too), not only on the video screen.
- **Performance log** (Settings → Performance log, on): about once a minute (every 5 minutes in
  the background) what the app is doing, how busy and big JavaScript is, and how much it
  downloads; with the next native build also CPU load, memory, heat, battery level, Low Power
  Mode, brightness and iOS's daily MetricKit reports (GPU time, background audio time, why
  iOS closed the app). Sent to your Jellyfin server every 12 hours (Dashboard → Logs,
  upload_Rakki_….log) with a summary of battery use by activity at the top. Send it now
  sends it straight away.

## 1.5.5 (2026-10-04)
- **Music videos play in the background**: the sound keeps going when you leave Rakki or lock
  your phone (the picture picks up again when you're back). Settings → Playback → Play music
  videos in the background turns it off. In the background, the next video starts straight
  away (no countdown). The lock screen still shows (and controls) your song for now; the video
  on the lock screen needs the next native build.
- The glass buttons lost their thin white outline (a touch more frosted instead).
- Loading is the play button itself now: an arc running round its edge, in the same place as
  the play button, also before the video has started (it used to be a separate spinner).

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
