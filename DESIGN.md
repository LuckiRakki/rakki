# Rakki's design

The direction for both apps (phone and desktop), and why each choice is what it is. Anything
not listed here follows the nearest existing screen.

## Ethos

1. **Spotify x Feishin look and feel.** Dark, with the album art's colour driving the accent.
2. **Spicy Lyrics is the headline.** Word by word is the default; Regular is the alternative.
   Every lyrics surface shows its source and credits (the Spicy Lyrics API Terms).
3. **Everything customizable, never cluttered.** Every visual choice is a setting with a good
   default. Settings show one group at a time, with the everyday choices first and the rest
   folded under More options.
4. **Light enough to forget it's running.** Nothing animates or redraws when nothing changes,
   and everything sleeps when out of sight.
5. **One Rakki.** The desktop has the phone's features and look, shares its code and behaves
   the same.
6. **Real icons, no emojis.** No glyph stand-ins (crosses, notes) either.
7. **Plain, honest wording.** Say what a thing does, in sentence case.
8. **Your music stays yours.** No server addresses or keys in the code.
9. **No loading screens.** An action finishes on screen at once and reports after ("Added to
   Wednesday" / "Couldn't add to Wednesday"), undoing itself if it failed. A spinner only when
   there's truly nothing to show yet, after 300 ms, and with words.

## Choices and their reasons

| Choice | Reason |
|---|---|
| Dark only | A music player in the Spotify / Feishin family: album art and a coloured accent carry the screen, and full-screen views sit on the art itself. A light theme would fight the art. |
| Inter (desktop) | The phone app's typeface on the desktop: Rakki looks like one app. |
| Ionicons | The phone's icon font, so the same action has the same picture on both. Missing ones (the sidebar, mini player, repeat one) are drawn in its outline style. |
| Accent: Lucid or your colour | The album decides the colour, like the phone. Every accent is lightened until it reads at 4.5:1 on the surfaces, and black text reads on it. |
| Accent only where it means something | What's playing (names, the playing bars, devices), the main action (play buttons, primary buttons), switches and the active-mode dot. Everything else is white or grey. |
| Focus ring: white, 2 px | White reads on every surface and every Lucid colour, where the accent might not. |
| Radii: 4 / 6 art, 8 rows and inputs, 10 cards, full pills | Pills are Spotify's convention for buttons and chips and are kept on purpose: action buttons, filters, choices and tags are all pills; cards and rows are not. |
| Shadows only on what floats | Menus, popovers, dialogs, the floating sidebar, the full player's cover and the video. Grid cards sit flat; hovering lifts them. |
| Muted text #a0a0a8 | The lightest grey that still reads at 4.5:1 on the lightest surface (--surface-4). |
| Genre tiles | The art's hue, darkened until white text reads at 4.5:1 (yellows and greens need the most). |
| Spicy's dimmed lines (exception) | Unsung and sung lines are dimmed to about 3.8:1 on purpose: the sung line is the content, the others are context, as in Spicy Lyrics. Hovering a line shows it fully. Agreed with the owner (antislop audit 001, item 19). |
| Motion | One set of curves (--ease-out for arrivals, --ease-in-out for departures, a soft spring for presses); 0.15-0.45 s; all off with reduced motion. |
| Moving backgrounds | Kawarp, as in Spicy Lyrics: the cover (or the video) blurred, warped and flowing, with a flat dark scrim so white text stays readable. Drawn at half resolution, stopped when paused or hidden. |
| Visualizer | audioMotion-analyzer with the owner's Feishin settings as the default (a white-to-grey line with a faint mirror). It hears only Rakki's own sound. |

## Width states (desktop)

- Wide: both sidebars beside the page.
- Under 1180 px: the right sidebar floats over the page and starts closed.
- Under 1000 px: the left sidebar shrinks to icons and covers.
- The player bar fits itself: below 1150 px the sleep timer and mini player move into More;
  below 940 px the Now playing view and Lyrics buttons do too.
