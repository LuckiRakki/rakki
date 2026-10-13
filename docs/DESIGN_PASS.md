# Design pass before Rakki desktop 1.0.0

Waiting on the user's go-ahead (2026-10-13). A full design pass over everything built for Rakki
desktop, extending to the phone app's new features (the Devices screen and the rest of this
round), plus refactoring, then the 1.0.0 build (installers are on hold until the user says so).
The user asked for the antislop plugin to be used for the review.

## Asked for specifically (on top of the overall pass)

1. **A more dynamic background in the full-screen views** (full player, lyrics, music video
   theater), like Spicy Lyrics'.
2. **The Spicy lyrics page like the web mod's:** the credits (written by, synced by, uploaded by,
   provider) inside the lyrics as their last lines, not a strip at the bottom.
3. **The web mod's Next up card** at the end of the lyrics.
4. **A visualizer screen in the full player**, alongside its other views (queue, related,
   lyrics), with its own icon in the bottom-right row.
5. **The music video theater's visualizer** moved: across the info side, ending at the album
   card, instead of its own row.
6. **Visualizer settings**, with the default being the user's Feishin visualizer (below).
7. **Customization matters:** options for all of it, in a settings menu that isn't cluttered
   (grouped, with the advanced ones folded away).

## What the references do

### Spicy Lyrics' background (github.com/Spikerko/spicy-lyrics, src/components/DynamicBG)

Not a blurred spinning cover. It's **Kawarp** (`@kawarp/core`, MIT, ~80 KB, WebGL): the cover
is domain-warped (bent like liquid), blurred with 8 Kawase passes, saturated (1.5x), dithered
(0.008) against banding, and animated slowly (speed 0.1, warp 1); new covers cross-fade (0.5-1 s).
On top, `BackgroundAnimationController` speeds the flow up and down with the music: section
tempo / 120 x a loudness factor, plus a pulse on each confident beat that decays quickly
(exp(-5t)), clamped 0.1-3x. Spicy gets tempo and beats from Spotify's audio analysis; Rakki has
no such data, so it would drive the same controller from the live sound (energy and onsets from
the visualizer's analyser). CSS on top: saturate(2.5) brightness(0.65).

### The user's Feishin visualizer (Feishin settings, store_settings.visualizer)

audioMotion-analyzer (AGPL-3.0, same as Rakki), these settings:

| Setting | Value |
|---|---|
| mode | 10 (line / area graph) |
| lineWidth | 1.9 |
| fillAlpha | 0 |
| gradient | custom "White and Gray": #ffffff at pos 0.7 (level 0.8), then #757575; vertical |
| channelLayout | single |
| fftSize | 16384 |
| smoothing | 0.6 |
| minFreq / maxFreq | 20 / 22050, log scale |
| minDecibels / maxDecibels | -85 / -25 |
| reflexRatio / reflexAlpha / reflexBright | 0.5 / 0.1 / 1 (the faint mirror under the line) |
| peakLine | true |
| maxFPS | 0 (display rate), opacity 1 |

Using the same library with these values gives exactly that look; the settings screen offers
its main options (mode, gradient and colours, line width, fill, bars, mirror and reflection,
frequency range, smoothing) with presets, rather than all ~50.

## Decisions needed when the work starts

- **Where the desktop visualizer gets the music's sound.** Music plays in mpv, outside the
  webview, so the page can't hear it (music videos are fine: they play in the page). Options:
  1. Capture this app's sound only: Windows 10 2004+ can capture one process (mpv); on Linux,
     PipeWire / PulseAudio can record mpv's stream. Recommended: shows only Rakki, not games.
  2. Capture everything the computer plays (simpler, but a game or a video call moves it too).
  The sound would be sent to the page and analysed there by audioMotion.
- **Background engine:** use Kawarp itself (MIT) rather than rewriting it.

## The overall pass (antislop)

- Every desktop screen and state: spacing, type scale, colour and contrast (including Lucid
  accents on light and dark covers), icons, hover / focus / pressed states, motion, empty and
  loading states, narrow windows.
- The phone's new screens against the phone's own look.
- Refactor: split the largest files (layout/frame.tsx, pages/pages.tsx, styles.css), remove
  dead code and leftovers, tidy what's shared with the phone app; no behaviour changes.
