# Notices and credits

Rakki is licensed under the [GNU Affero General Public License v3.0](LICENSE). It builds on the
projects below; each keeps its own licence.

## Ported or adapted

| Project | Licence | What Rakki uses |
|---|---|---|
| SpicyLyrics-Jellyfin web mod (by the Rakki author) | AGPL-3.0 | `src/spicy`: the lyrics renderer is a port of the web mod's `LyricsAnimator` to Skia; `Spring.ts` and `Spline.ts` are copied from it. |
| [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) by Spikerko | AGPL-3.0 | The look and motion the web mod reproduces (word springs, letter emphasis, glow, depth blur). Lyrics from the Spicy Lyrics API are shown with their source and attribution, as its terms require. |
| [just_audio](https://github.com/ryanheise/just_audio) by Ryan Heise | MIT | `modules/rakki-audio`: the gapless "treadmill" design (an AVQueuePlayer holding the current song and the next ones) follows just_audio's iOS player, rewritten in Swift. Copyright (c) Ryan Heise and contributors, MIT licence. |

## References (behaviour and design, no code)

| Project | Licence | |
|---|---|---|
| [Finamp](https://github.com/jmshrv/finamp) | MPL-2.0 | Playback reporting cadence, offline and download behaviour. |
| [Feishin](https://github.com/jeffvli/feishin) | GPL-3.0 | The look, the feature set, the radio section. |
| [audio_service](https://github.com/ryanheise/audio_service) | MIT | Lock screen and remote command handling. |

## Libraries and assets

- [Expo](https://expo.dev), [React Native](https://reactnative.dev),
  [React Native Skia](https://shopify.github.io/react-native-skia/),
  [Reanimated](https://docs.swmansion.com/react-native-reanimated/),
  [TanStack Query](https://tanstack.com/query), [Zustand](https://zustand.docs.pmnd.rs) and
  the other packages in `package.json`, under their own licences (MIT for most).
- Fonts: Inter, DM Sans, Figtree and Plus Jakarta Sans (SIL Open Font License 1.1), through
  `@expo-google-fonts`.
- Icons: [Ionicons](https://ionic.io/ionicons) (MIT), through `@expo/vector-icons`.
- The Rakki neko icon is the author's own artwork.

## Data

- [Jellyfin](https://jellyfin.org): your own server; Rakki only talks to the address you give it.
- [Last.fm](https://www.last.fm/api): worldwide play counts, with your own API key, labelled
  as coming from Last.fm.
