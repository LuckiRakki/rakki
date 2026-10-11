# Daily Mixes (framework)

The user's request (2026-10-10): six Spotify-style Daily Mixes, each 50–100 songs, each a
different genre / tone, built from the library with a 2:2:1 ratio of **popular** (worldwide,
Last.fm) : **yours** (what you play) : **new** (recently added or never played). Each mix starts
from an artist/song you play a lot and grows from there. Stored as server playlists named
`[Rakki] Daily Mix N`; Rakki hides them from the normal playlist places and gives them their
own Home shelf and Library tab. Cover: 1000×1000, the seed artist's photo, "Daily Mix" big at
the bottom left, the number at the bottom right.

Status (2026-10-11): **phases 1 and 2 live (covers to come), phase 3 partly** (hidden from
the playlist places, Home shelf; the Library "Mixes" tab is still to do). Phase 1 notes: The companion plugin lives in
`server/` (Jellyfin.Plugin.Rakki, net9.0, Jellyfin 10.11): settings page with the Last.fm key
and the tuning knobs, and a dry run at `GET /Rakki/DailyMix/Preview` (admins only), also shown
on the plugin's settings page as "Preview tonight's mixes". Nothing is written to the server
yet: no playlists, no history.

**Decided (2026-10-10):** built at **12 AM** every night; **100 songs** per mix; the user's
Last.fm key may be stored in the plugin's settings on the server. It lives in the planned
**Rakki companion plugin** (below), not in an existing plugin.

## Where it runs: on the server, in the Rakki companion plugin

Building six mixes means reading every song's play history, genres and artists, asking
Last.fm about a few hundred artists and songs, and rewriting six playlists. On the phone that
would cost battery and data every day and only happen when the app is open. On the server it
runs once a night whether or not the phone is on, and Rakki only reads the result.

The Rakki companion plugin (C#, Jellyfin 10.11; see FRAMEWORK.md's backlog) gets a scheduled
task, **Rakki Daily Mixes** (daily 12 AM, plus "Run now" in Dashboard → Scheduled tasks), with
direct access to the library (`ILibraryManager`), play data (`IUserDataManager`), playlists
(`IPlaylistManager`) and images (`IProviderManager`; SkiaSharp ships with Jellyfin).
Plugin settings: the Last.fm API key (today it's only on the phone), which Jellyfin user to
build for, mix count (6), size (100).

What's stored where on the server:
- **Settings** (the Last.fm key, user, mix count/size): the plugin's configuration file,
  `/config/data/plugins/configurations/Jellyfin.Plugin.Rakki.xml`, edited on the plugin's page
  in the Dashboard. Readable by Jellyfin admins and anyone with access to the server's files.
  The key is shared with the Rakki app (admins only, `GET/POST /Rakki/LastFm/Key`): whichever
  side has one fills in the other at sign-in, and a key changed in the app's Settings is sent
  to the server after Last.fm accepts it (src/lib/companion.ts).
- **Last.fm answers** (popularity, similar artists, tags): a cache file in the plugin's data
  folder (`/config/data/plugins/Rakki/lastfm-cache.json`), kept 30 days.
- **The mixes themselves:** ordinary Jellyfin playlists (`[Rakki] Daily Mix 1` to `6`), stored
  where Jellyfin keeps every playlist, with their covers as normal playlist pictures.

## The data

- **Your plays:** every song's play count, last played date and like (Jellyfin user data).
  "Plays lately" = plays weighted by recency (a play this week counts more than one in May).
- **Worldwide popularity:** Last.fm `track.getInfo` / `artist.getTopTracks` playcount and
  listeners, cached 30 days on the server (`lastfm-cache.json`, like the lyrics index).
- **Likeness:** Last.fm `artist.getSimilar` (match 0–1) and `artist.getTopTags` (genre and
  mood tags such as "shoegaze", "chill", "aggressive"), cached 30 days, plus the songs' own
  genre tags.
- **New:** added in the last 30 days, or never played.

## Tag groups (what keeps a mix cohesive)

Genres that belong together are grouped before anything is picked, so Rock never lands in a
Hip Hop mix, while close neighbours do share one: Plugg with Cloud Rap, Slacker Rock with
Incelcore, Shoegaze with Dream Pop.

- Each artist gets a tag profile: Last.fm `artist.getTopTags` (weighted by Last.fm's tag count)
  plus the genre tags on your songs.
- Tags that often appear on the same artists are linked (co-occurrence across your library,
  weighted by how strongly each artist carries them), and the linked tags are clustered into
  **tag groups**. That's how "plugg" and "cloud rap" end up together: the same artists carry
  both, even though the words share nothing.
- An artist belongs to the group holding most of its tag weight. A song belongs to its artist's
  group unless its own genre tags clearly say otherwise.
- A mix only takes songs from its seed's group (and, for a little variety, the group most
  linked to it, at most 15% of the songs).

## How a mix is built

1. **Pick the lead artist with a smart random picker, not "most played".** Every artist you
   have is scored, then the lead is drawn at random with chances in proportion to the score:
   - *You know them:* some plays of your own (enough that the mix starts somewhere familiar),
     but the score flattens out at the top, so your five most played don't always win.
   - *Niche counts too:* artists with fewer Last.fm listeners score a little higher, so lesser
     known artists you play get their turn.
   - *Room in the library:* enough songs in the artist's tag group to fill 100 well.
   - **The 3-day rule:** an artist who led any mix in the last 3 days can't lead today (kept in
     the plugin's data folder as the last 3 days of leads).
   - *Different groups:* each of the six leads must come from a different tag group, so the
     six mixes are six different genres or tones.

   The user's later "mix feels" (e.g. "Mix 6 = an artist with about half of Mix 1's plays")
   become per-mix rules on top of this.
2. **Neighbourhood.** The lead plus artists you have that Last.fm calls similar (match ≥ 0.25)
   *and* that sit in the same tag group.
3. **Three pools** from the neighbourhood's songs, each ranked a different way:
   - *Popular* (40): highest **Last.fm** playcount, songs the world plays most;
   - *Yours* (40): highest **local** play counts lately (and liked songs);
   - *New* (20): **niche**: low Last.fm playcounts, preferring songs added in the last 30 days
     or never played by you, ranked by likeness to the lead.

   A song lands in only one pool (the first that claims it, in that order).
4. **Fill 2:2:1** to 100 songs (40 / 40 / 20), dealt in a repeating P, Y, P, Y, N pattern.
5. **Order.** First song: a song by the lead artist that you play a lot. After that, no artist
   twice within 3 songs, and no artist above ~15% of the mix (the lead can go to ~25%).
6. **Day to day.** At most ~30% of yesterday's songs come back, and leads change every day (the
   3-day rule), so each day's six mixes are new without losing their character.
7. **Write.** Replace the items of `[Rakki] Daily Mix N` (create once, then update in place, so
   the playlist ids, and anything that refers to them, stay the same). Save a short "why" note
   per mix (lead, tag group, pool counts) in the playlist overview for tuning.

## The cover (1000×1000)

The seed artist's primary image (cover-cropped), a dark gradient over the bottom third,
"Daily Mix" in heavy type bottom left (about 110 px, readable at 48 px tile size), the mix
number bottom right (about 160 px), and an accent stripe in a colour from the image. Drawn
with SkiaSharp and uploaded as the playlist's Primary image. A mockup goes to the user before
it's finalised.

## In Rakki

- Playlists whose name starts with `[Rakki]` are left out of Library → Playlists, Home's
  "Your playlists", Add to playlist (you don't add to a mix), search's playlist results, and
  the playlist cache's "in any playlist" heart.
- **Home:** a "Your Daily Mixes" shelf (the six covers), shown as "Daily Mix 1" with a
  subtitle like "Paramore, Hayley Williams and more".
- **Library:** a "Mixes" tab (reorderable like the others).
- Opening one is a normal playlist page (download, shuffle toggle, sort and find all work).
- Rakki notices the nightly change through the playlist cache's Etag check.

## Phases

1. **Plugin task + report:** the builder and a dry-run endpoint
   (`GET /Rakki/DailyMix/Preview`) that returns the six mixes with reasons, without
   writing anything. Tune with the user on real data.
2. **Writing playlists + covers:** the nightly task creates and updates the playlists, with
   cover mockups approved first.
3. **Rakki UI:** hide `[Rakki]` playlists, the Home shelf and the Mixes tab (an over-the-air
   update; no native build).
4. **Mix feels:** per-mix seed rules from the user ("Mix 1 = my most played artist", "Mix 6 =
   about half of Mix 1's plays", and so on).

## The code (server/src)

- `LastFm/LastFmClient.cs`: tags, listeners, similar artists, top tracks; one request at a
  time (~4/s); every answer kept 30 days in `lastfm-cache.json`.
- `DailyMix/Library.cs`: songs (under 60 s left out, duplicates folded), artists, "plays
  lately" (Jellyfin keeps a play count and the last date, so recency weights the count).
- `DailyMix/TagGroups.cs`: tag profiles and the average-linkage grouping
  (`TagGroupLikeness`, default 0.22).
- `DailyMix/MixBuilder.cs`: lead draw, neighbourhood, pools, order. Seeded by date + user,
  so a day's preview and its build agree.
- `DailyMix/MixService.cs` + `DailyMixController.cs`: background build with progress, the
  preview endpoint. `MixModels.cs`: the result and the history file (written from phase 2).

Build: `dotnet build -c Release` in `server/`; the DLL goes to
`/config/data/plugins/Rakki_0.1.0.0/` on the server, then Jellyfin restarts. Pushes that only
touch `server/` don't publish an app update.

## Questions for the user before building

- (Answered: 12 AM, 100 songs, the key may live in the plugin's settings.)
- Should mixes avoid songs you skipped a lot? (Needs skip tracking, which Rakki doesn't send
  yet.)
