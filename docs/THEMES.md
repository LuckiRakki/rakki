# Rakki themes

A theme changes how Rakki looks, the way a Spicetify theme changes Spotify. There's no
marketplace: a theme is one `.css` file, and you add it in **Settings → Look → Theme → Import**.
Importing a file with the same name again replaces the old copy, so you can edit a theme and
import it again to see the change. **Use** switches between themes, and **Rakki** is the
built-in default look.

Themes work on the desktop app now. The phone app will use the same files later: it will read
the colours on `:root` (the tokens below). The rest of the CSS only applies on the desktop.

The built-in **Lucid** (`desktop/src/themes/lucid.css`, a still blurred cover) and **Kawarp**
(`desktop/src/themes/kawarp.css`, the cover flowing) themes are good files to copy and start
from.

## The file

```css
/*
 * @name My Theme
 * @author Your Name
 * @description One line about it.
 * @version 1.0
 * @backdrop album
 */

:root {
  --bg: #060606;
  --surface: rgba(10, 10, 12, 0.45);
}

.panel { border: 1px solid rgba(255, 255, 255, 0.1); }
```

The first comment holds the theme's details, one `@key value` per line:

| Key | What it does |
|---|---|
| `@name` | The name shown in Settings (otherwise the file's name). |
| `@author`, `@description`, `@version` | Shown under the name. |
| `@backdrop` | What's behind the whole window: `none` (the default), `album` (the playing song's cover, blurred and still) or `flow` (the cover moving like the full player's background). |

The file can't use `@import` (a theme is one file) and can be up to 512 KB. Fonts and pictures
can still come from the web with `url(...)`.

## Tokens (both apps)

Set these on `:root`:

| Token | What it colours |
|---|---|
| `--bg` | Behind everything. |
| `--surface` | The panels (sidebar, main area, right sidebar). |
| `--surface-2`, `--surface-3`, `--surface-4` | Raised things: cards, chips, buttons, hover. |
| `--line` | Dividers and borders. |
| `--text`, `--text-2`, `--text-3` | Text: main, secondary, faint. |
| `--radius` | Corner size of cards and panels. |

The accent stays yours: Settings → Look → Colour (your colour, or Lucid's album colour) sets
`--accent` over any theme. Colours Rakki sets while it runs, for a theme to use:

| Variable | What it is |
|---|---|
| `--now` | The playing album's colour (always, whatever the accent setting). Try `color-mix(in srgb, var(--now) 10%, rgba(8, 8, 10, 0.4))` for panels tinted by the album. |
| `--accent`, `--accent-soft` | The accent, and a faint version of it for backgrounds. |
| `--tint` | On album, playlist and artist pages, and in the full player and lyrics: that item's colour. |

## Backdrop settings (desktop)

With `@backdrop album` or `flow`, these set how the cover looks behind the panels. Make
`--surface` see-through (an `rgba` colour) or the cover won't show.

| Variable | Default |
|---|---|
| `--backdrop-blur` | `32px` |
| `--backdrop-brightness` | `0.4` |
| `--backdrop-saturation` | `1.5` |

## Styling anything else (desktop)

Any CSS works, and the theme comes after Rakki's own styles. Useful class names:

- `.app` the whole window; `.titlebar`, `.search`, `.navbtn`
- `.panel` every panel; `.sidebar`, `.main`, `.rightpanel`
- `.playerbar` the bar at the bottom; `.pp` the play button; `.range` the seek and volume bars
- `.home-top` Home's top band; `.quick` its shortcut tiles; `.card` covers in a grid
- `.lib-header`, `.action-bar` the top of album, playlist and artist pages
- `.np-card` cards in the right sidebar; `.lyrics-card` its lyrics card
- `.lyrics-main` the lyrics in the main area; `.nowplaying` the full player
- `.menu`, `.dialog`, `.toast`, `.settings-card`
- `<html data-theme="...">` names the theme in use (`default`, `lucid`, or `file:...`).
