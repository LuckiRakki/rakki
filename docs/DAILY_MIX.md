# Daily Mixes (framework)

The user's request (2026-10-10): six Spotify-style Daily Mixes, each 50–100 songs, each a
different genre / tone, built from the library with a 2:2:1 ratio of **popular** (worldwide,
Last.fm) : **yours** (what you play) : **new** (recently added or never played). Each mix starts
from an artist/song you play a lot and grows from there. Stored as server playlists named
`[Rakki] Daily Mix N`; Rakki hides them from the normal playlist places and gives them their
own Home shelf and Library tab. Cover: 1000×1000, the seed artist's photo, "Daily Mix" big at
the bottom left, the number at the bottom right.

Status: framework only. Nothing is built yet.

## Where it runs: on the server, in the Spicy Lyrics plugin

Building six mixes means reading every song's play history, genres and artists, asking
Last.fm about a few hundred artists and songs, and rewriting six playlists. On the phone that
would cost battery and data every day and only happen when the app is open. On the server it
runs once a night whether or not the phone is on, and Rakki only reads the result.

The Spicy Lyrics plugin (C#, already deployed on the user's Jellyfin 10.11) gets a scheduled
task, **Rakki Daily Mixes** (daily 5 AM, plus "Run now" in Dashboard → Scheduled tasks), with
direct access to the library (`ILibraryManager`), play data (`IUserDataManager`), playlists
(`IPlaylistManager`) and images (`IProviderManager`; SkiaSharp ships with Jellyfin).
Plugin settings: the Last.fm API key (today it's only on the phone), which Jellyfin user to
build for, mix count (6), size (default 60, 50–100).

## The data

- **Your plays:** every song's play count, last played date and like (Jellyfin user data).
  "Plays lately" = plays weighted by recency (a play this week counts more than one in May).
- **Worldwide popularity:** Last.fm `track.getInfo` / `artist.getTopTracks` playcount and
  listeners, cached 30 days on the server (`lastfm-cache.json`, like the lyrics index).
- **Likeness:** Last.fm `artist.getSimilar` (match 0–1) and `artist.getTopTags` (genre and
  mood tags such as "shoegaze", "chill", "aggressive"), cached 30 days, plus the songs' own
  genre tags.
- **New:** added in the last 30 days, or never played.

## How a mix is built

1. **Seeds.** Rank your artists by plays lately. Mix 1's seed is your most played artist. The
   other five are picked down the list so that each sits in a different tag cluster (genre /
   tone) from the ones before. The user's later idea of fixed "mix feels" (e.g. "Mix 6 = an
   artist with about half of Mix 1's plays") becomes a per-mix seed rule in settings.
2. **Neighbourhood.** The seed artist plus similar artists you have (Last.fm similarity ≥ 0.25,
   in the library), kept inside the seed's cluster by tag overlap (Jaccard on top tags + genre
   tags) so a mix stays cohesive.
3. **Three pools** from that neighbourhood's songs:
   - *Popular:* highest worldwide playcount;
   - *Yours:* highest plays lately (and liked);
   - *New:* recently added or never played, ranked by likeness to the seed.
4. **Fill 2:2:1** to the target size, dealt in a repeating P, Y, P, Y, N pattern.
5. **Order.** First song: a seed-artist song you play a lot. After that, no artist twice within
   3 songs, and no artist above ~15% of the mix (the seed artist can go to ~25%).
6. **Day to day.** At most ~30% of yesterday's songs come back; seeds rotate among your top
   artists over the week, so the mixes change without losing their character.
7. **Write.** Replace the items of `[Rakki] Daily Mix N` (create once, then update in place, so
   the playlist ids, and anything that refers to them, stay the same). Save a short "why" note
   per mix (seed, cluster tags, pool counts) in the playlist overview for tuning.

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
   (`GET /SpicyLyrics/DailyMix/Preview`) that returns the six mixes with reasons, without
   writing anything. Tune with the user on real data.
2. **Writing playlists + covers:** the nightly task creates and updates the playlists, with
   cover mockups approved first.
3. **Rakki UI:** hide `[Rakki]` playlists, the Home shelf and the Mixes tab (an over-the-air
   update; no native build).
4. **Mix feels:** per-mix seed rules from the user ("Mix 1 = my most played artist", "Mix 6 =
   about half of Mix 1's plays", and so on).

## Questions for the user before building

- Refresh time (5 AM?) and size (60 songs?).
- Is the Last.fm key OK to store in the plugin's settings on the server?
- Should mixes avoid songs you skipped a lot? (Needs skip tracking, which Rakki doesn't send
  yet.)
