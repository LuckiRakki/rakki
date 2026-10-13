# Playing on other devices (like Spotify Connect)

The user's request (2026-10-12): Rakki on the desktop and Rakki on the phone know about each
other. You can see what the other one is playing, control it, and move playback from one to
the other ("play on my phone" / "play here"), picking up the same queue at the same moment.
Built: phase 1 (2026-10-12: both apps send capabilities and their queue; the desktop's Devices
button lists your other Rakki apps), phases 2 and 3 (2026-10-13: both apps take commands over
the server's live connection, src/remote/socket.ts; the desktop controls another device from
its player bar and moves playback both ways, src/remote/devices.ts + desktop
src/player/remote.ts). Not yet: the phone's own Devices button (controlling the desktop from
the phone), and phase 4.

## What Jellyfin already gives us

Jellyfin keeps a **session** for every signed-in app, and has a remote-control system built in
(it's how the Jellyfin web app's "Play on" menu works):

- `GET /Sessions?ControllableByUserId={me}`: every app signed in as you, with what it's playing
  (`NowPlayingItem`), where (`PlayState.PositionTicks`, `IsPaused`, `RepeatMode`,
  `PlaybackOrder`), the queue it reported (`NowPlayingQueue`), when it last checked in
  (`LastPlaybackCheckIn`), and whether it accepts commands (`SupportsRemoteControl`).
- Sending commands to another app: `POST /Sessions/{id}/Playing` (play these songs, from this
  one, at this position), `POST /Sessions/{id}/Playing/{Pause|Unpause|PlayPause|Stop|NextTrack|PreviousTrack|Seek}`,
  `POST /Sessions/{id}/Command` (volume and the like).
- The receiving app gets those commands over Jellyfin's **WebSocket** (`/socket`) as `Play`,
  `Playstate` and `GeneralCommand` messages, and must tell Jellyfin it can take them
  (`POST /Sessions/Capabilities/Full`: `SupportsMediaControl`, `PlayableMediaTypes: Audio`,
  the commands it understands).

Today neither Rakki app does those last two, and neither sends its queue. That's the work.

## The pieces

1. **Every Rakki says what it can do** (`Sessions/Capabilities/Full` at sign-in and after a
   reconnect), and **sends its queue** with its progress reports: `NowPlayingQueue` (song ids
   with entry ids), `PlaylistIndex`, shuffle and repeat. Then any Rakki can rebuild another's
   queue from Jellyfin alone.
2. **Every Rakki listens** on Jellyfin's WebSocket and obeys `Play`, `Playstate` and
   `GeneralCommand` (play these songs from here, pause, resume, next, previous, seek, stop,
   volume). The desktop can do this at any time. The phone can while it's open or playing
   (iOS keeps a playing app running; an idle, suspended app gets nothing until it's opened).
3. **A Devices button** (desktop player bar, next to volume; phone player, next to AirPlay)
   lists your other Rakki sessions that are playing or ready, with what's on: "Rakki on
   iPhone · Sarah · Alex G".
4. **Moving playback:**
   - *Play here* (pull): read the other session's queue, index and position, start it here at
     that position (adding the seconds since its last check-in while it was playing), then send
     it `Stop`. The gap is a second or two.
   - *Play on {device}* (push): `POST /Sessions/{id}/Playing` with the queue (`ItemIds`), the
     index (`StartIndex`) and the position (`StartPositionTicks`), then stop here once the other
     side reports it's playing.
   - *Control without moving*: the player bar shows "Playing on iPhone" and its buttons send
     commands to that session instead of playing here (Spotify's look when another device is
     active).
5. **Exact position:** progress reports come every 10 s, so the position is worked out as
   reported position + time since `LastPlaybackCheckIn` (when it wasn't paused). Before a pull,
   Rakki can ask the other session to report right away (a `Playstate` no-op isn't standard;
   instead the controller sends `Pause`, waits for the paused report, which carries the exact
   position, then starts here: a clean hand-off).

## Where things live

| Piece | Phone app | Desktop | Server |
|---|---|---|---|
| Capabilities + queue in reports | `player/reporting.ts` | `player/store.ts` (reporting) | Jellyfin (built in) |
| WebSocket commands | new `remote/socket.ts` | shared via `@/remote/socket` | Jellyfin |
| Devices list + hand-off | new `remote/devices.ts` (shared code) | same module | Jellyfin |
| Better queues (optional) | | | Rakki plugin: `POST /Rakki/Remote/Queue` to store a full queue (shuffle order, radio state) per session, when `NowPlayingQueue` isn't enough |

The WebSocket client, the devices list and the hand-off logic are plain TypeScript, written
once in `src/remote/` and shared by both apps (like the Jellyfin client is today); each app
only connects them to its own player.

## Phases

1. **Visible:** both apps send capabilities and their queue; the Devices button lists your
   other Rakki sessions with what they're playing. (No control yet; proves the data.)
2. **Remote control:** the WebSocket listener in both apps; control another session from the
   Devices menu (play/pause/next/previous/seek/volume), and the "Playing on {device}" player
   bar.
3. **Hand-off:** Play here / Play on {device}, with the pause-then-start hand-off.
4. **Polish:** the phone's lock screen and the desktop's tray show "Playing on {device}";
   automatic reconnects; the Rakki plugin's full-queue store if `NowPlayingQueue` proves too
   thin (it has no shuffle order or radio context).

## Limits to know

- iOS suspends Rakki when it's neither open nor playing; then it can't receive commands
  (pushing to an idle phone needs push notifications, which need a paid Apple account). Pulling
  *from* the phone works whenever it last reported.
- Both apps must be signed in to the same server as the same user (or a user allowed to
  control the other's sessions).
- Radio stations (SUB/WAVE, internet radio) aren't Jellyfin items: they move by sending the
  station's address through the plugin's queue store, or stay out of hand-off at first.
