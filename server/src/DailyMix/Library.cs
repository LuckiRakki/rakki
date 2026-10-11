// The library as the Daily Mixes see it: every song with its artist, genres and your plays,
// grouped by artist. Read fresh for each build (a few seconds for ~7,000 songs).

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.Rakki.DailyMix
{
    public sealed class Song
    {
        public Guid     Id        { get; init; }
        public string   Name      { get; init; } = string.Empty;
        /// <summary>The song's main artist, as written.</summary>
        public string   Artist    { get; init; } = string.Empty;
        public string   ArtistKey { get; init; } = string.Empty;
        /// <summary>The title reduced for matching against Last.fm (see Library.TitleKey).</summary>
        public string   TitleKey  { get; init; } = string.Empty;
        /// <summary>The song's album (artist and title, reduced); empty for a song without one.</summary>
        public string   AlbumKey  { get; init; } = string.Empty;
        public string[] Genres    { get; init; } = System.Array.Empty<string>();
        public int      Plays     { get; init; }
        public DateTime? LastPlayed { get; init; }
        public bool     Liked     { get; init; }
        /// <summary>Times you stopped it before halfway (Skips/SkipTracker.cs).</summary>
        public int      Skips     { get; init; }

        /// <summary>1 for songs you never skip, less the more you skip them compared with playing them.</summary>
        public double   Keep      => (1.0 + Plays) / (1.0 + Plays + Skips);
        public DateTime Added     { get; init; }

        /// <summary>
        /// "Plays lately": plays, weighted by how recently the song was last played (Jellyfin keeps
        /// a count and the last date, not every play), plus a bit for a like.
        /// </summary>
        public double Lately { get; init; }

        /// <summary>Worldwide plays on Last.fm (filled in for the songs a mix considers; -1 = unknown).</summary>
        public long LastFmPlays { get; set; } = -1;
    }

    public sealed class Artist
    {
        public string     Key    { get; init; } = string.Empty;
        public string     Name   { get; init; } = string.Empty;
        public List<Song> Songs  { get; } = new();
        public int        Plays  => Songs.Sum(s => s.Plays);
        public double     Lately => Songs.Sum(s => s.Lately);
    }

    public sealed class Library
    {
        /// <summary>Shorter songs (intros, skits, interludes) never go in a mix.</summary>
        private static readonly long MinTicks = TimeSpan.FromSeconds(60).Ticks;

        public List<Song> Songs { get; } = new();
        public Dictionary<string, Artist> Artists { get; } = new();

        public static Library Read(ILibraryManager library, IUserDataManager userData, IUserManager users, Guid userId, DateTime now, IReadOnlyDictionary<Guid, Skips.SkipRecord> skips)
        {
            var user = users.GetUserById(userId) ?? throw new ArgumentException("No such user.", nameof(userId));
            var items = library.GetItemList(new InternalItemsQuery(user)
            {
                IncludeItemTypes = new[] { BaseItemKind.Audio },
                Recursive        = true,
            }).OfType<Audio>();

            var lib = new Library();
            foreach (var item in items)
            {
                if (item.RunTimeTicks is long t && t < MinTicks) continue;
                var artistName = Clean(item.Artists?.FirstOrDefault() ?? item.AlbumArtists?.FirstOrDefault() ?? string.Empty);
                var artistKey = NameKey(artistName);
                if (artistKey.Length == 0) continue;
                var titleKey = TitleKey(item.Name ?? string.Empty);
                var ud = userData.GetUserData(user, item);
                var plays = ud?.PlayCount ?? 0;
                var skipped = skips.TryGetValue(item.Id, out var sk) ? sk.Count : 0;
                // Songs you mostly skip never go in a mix.
                if (skipped >= 3 && skipped > plays) continue;
                var song = new Song
                {
                    Id         = item.Id,
                    Name       = item.Name ?? string.Empty,
                    Artist     = artistName,
                    ArtistKey  = artistKey,
                    TitleKey   = titleKey,
                    AlbumKey   = string.IsNullOrWhiteSpace(item.Album) ? string.Empty
                        : NameKey(item.AlbumArtists?.FirstOrDefault() ?? artistName) + "|" + TitleKey(item.Album),
                    Genres     = (item.Genres ?? System.Array.Empty<string>()).Select(TagGroups.NormTag).Where(g => g.Length > 0).Distinct().ToArray(),
                    Plays      = plays,
                    LastPlayed = ud?.LastPlayedDate,
                    Liked      = ud?.IsFavorite ?? false,
                    Skips      = skipped,
                    Added      = item.DateCreated,
                    Lately     = LatelyOf(plays, ud?.LastPlayedDate, ud?.IsFavorite ?? false, now),
                };
                lib.Songs.Add(song);
            }

            // The same song twice (an album and its deluxe edition): keep the most played copy.
            foreach (var dupes in lib.Songs.GroupBy(s => s.ArtistKey + "|" + s.TitleKey).Where(g => g.Count() > 1 && g.Key.Length > 1).ToList())
            {
                var keep = dupes.OrderByDescending(s => s.Plays).ThenBy(s => s.Added).First();
                foreach (var s in dupes) if (s != keep) lib.Songs.Remove(s);
            }

            foreach (var s in lib.Songs)
            {
                if (!lib.Artists.TryGetValue(s.ArtistKey, out var a))
                {
                    a = new Artist { Key = s.ArtistKey, Name = s.Artist };
                    lib.Artists[s.ArtistKey] = a;
                }
                a.Songs.Add(s);
            }
            return lib;
        }

        private static double LatelyOf(int plays, DateTime? last, bool liked, DateTime now)
        {
            if (plays <= 0) return liked ? 2 : 0;
            var days = last is DateTime d ? Math.Max(0, (now - d).TotalDays) : 365;
            return plays * (0.3 + 0.7 * Math.Exp(-days / 60)) + (liked ? 2 : 0);
        }

        /// <summary>Invisible characters (U+FEFF, U+200B…) some tags carry are dropped.</summary>
        public static string Clean(string s) =>
            new string(s.Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.Format).ToArray()).Trim();

        /// <summary>An artist name for matching: case, accents, "the", punctuation don't count.</summary>
        public static string NameKey(string name)
        {
            var s = Fold(Clean(name));
            s = Regex.Replace(s, "&", " and ");
            s = Regex.Replace(s, "[^a-z0-9]+", " ").Trim();
            if (s.StartsWith("the ", StringComparison.Ordinal)) s = s[4..];
            return s;
        }

        /// <summary>
        /// A title for matching (same rules as Rakki's lib/lastfm.ts matchKey): featuring credits
        /// and edition notes ("(feat. X)", "- 2011 Remaster") don't count.
        /// </summary>
        public static string TitleKey(string title)
        {
            var s = Fold(Clean(title));
            s = Regex.Replace(s, @"[(\[](?:feat|ft|with|featuring)\b[^)\]]*[)\]]", string.Empty);
            s = Regex.Replace(s, @"[(\[][^)\]]*\b(?:remaster(?:ed)?|version|mono|stereo|deluxe|bonus|explicit|clean)\b[^)\]]*[)\]]", string.Empty);
            s = Regex.Replace(s, @"\s-\s.*\b(?:remaster(?:ed)?|version|mono|stereo|edit)\b.*$", string.Empty);
            s = s.Replace("&", " and ");
            return Regex.Replace(s, "[^a-z0-9]+", " ").Trim();
        }

        private static string Fold(string s)
        {
            var d = s.ToLowerInvariant().Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder(d.Length);
            foreach (var c in d) if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
            return sb.ToString();
        }
    }
}
