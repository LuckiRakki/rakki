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

Checked against the API Terms (developers.spicylyrics.org/terms, 2026-10-11):

- One key shipped in the plugin is **not allowed** (section 3: don't share a key; everyone who
  runs their own copy on a server needs their own key). The code must never contain a key.
- Each user making their own application and `sl_sk_` key is allowed, but section 3 steers
  apps used by non-developers to an **app template** (section 12) instead.
- An app template fits Rakki: the plugin runs on each user's own server and needs a key per
  person. Each user clicks **Add** on the template's catalog page and gets their own
  application (key type, rate limit and scopes set by the template; it doesn't use up their
  own application slots). The template is a **secret key** (`sl_sk_`), since the key lives
  in the plugin on the user's server; no origin allowlist.
- Still applies: 30-day cache (section 7, already done), naming the provider and crediting
  the uploader wherever lyrics show (section 6, Rakki and the web mod do), lyrics only shown
  in the app, never offered as a download or a public source (section 5), no "Spicy Lyrics"
  in the app's name or listing, and anything ported from a Spicy Lyrics project says plainly
  that it's unofficial (section 5).

Steps: submit the template at developers.spicylyrics.org/dashboard/templates; once approved,
its catalog link goes on the settings page ("Get a key for Rakki") and here.
