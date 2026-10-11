# Rakki companion plugin (Jellyfin 10.11)

Everything the Rakki app needs from the server, in one plugin. Settings: Dashboard → Plugins →
Rakki.

| Feature | What it does | Endpoints |
| --- | --- | --- |
| Lyrics (formerly the Spicy Lyrics TTML plugin) | Word-by-word lyrics from `.ttml` files next to the songs; the Spicy Lyrics API as a fallback (30-day cache, nightly refresh); a nightly scraper for missing `.ttml` files (LyricsPlus/KPoe); lyrics search; timing offsets | `GET /SpicyLyrics/{id}/ttml`, `/SpicyLyrics/{id}/hasLyrics`, `/SpicyLyrics/Search`, `POST /SpicyLyrics/{id}/offset` (paths kept, so the web mod and Feishin work unchanged) |
| Daily Mixes | Six mixes a night (phase 1: preview only; docs/DAILY_MIX.md) | `GET /Rakki/DailyMix/Preview` (admins) |
| Skip tracking | Songs stopped before halfway, from any app; Daily Mixes leave out songs you mostly skip | (internal) |
| Playlist sync | Rakki's playlist cache in one request | `POST /Rakki/Playlists/Sync` |
| Performance logs | Reads the logs Rakki uploads, on the settings page | `GET /Rakki/PerfLogs`, `/Rakki/PerfLogs/{name}` (admins) |
| Last.fm key | Shared with the app, so it's entered once | `GET /Rakki/Info`, `GET`/`POST /Rakki/LastFm/Key` (admins) |

Data: `/config/data/plugins/Jellyfin.Plugin.Rakki/` (Last.fm cache, skips, Daily Mix history,
lyrics search index, Spicy Lyrics API cache). Settings:
`/config/data/plugins/configurations/Jellyfin.Plugin.Rakki.xml`.

## Taking over from Spicy Lyrics TTML

At its first start the plugin copies the old plugin's settings (including the Spicy Lyrics API
key) and saved data (Migration.cs). The old plugin must be removed first: both serve
`/SpicyLyrics/...`. Its files are left in place, so going back is possible.

## Build and install

```bash
dotnet build -c Release
```

Copy `bin/Release/net9.0/Jellyfin.Plugin.Rakki.dll`, `meta.json` and
`assets/rakki-plugin.png` (the Dashboard cover) to `/config/data/plugins/Rakki_<version>/`, then
restart Jellyfin.

## Spicy Lyrics API key: app template (planned)

The Spicy Lyrics API needs a key per application. For an app other people install, Spicy Lyrics
offers **app templates** (developers.spicylyrics.org/docs/keys): the developer submits the app
once (Dashboard → Templates), and after approval it gets a catalog page where each user clicks
**Add** to get their own application and key, with the key type and rate limit the template
sets. It doesn't use the user's own application slots.

For Rakki the key lives in this plugin on the user's own server, so the template is a
**secret key** (`sl_sk_`, server-side; no origin allowlist needed). Once the template is
approved, the settings page's "Secret key" field links to its catalog page ("Get a key for
Rakki"), replacing the "create an application" link.
