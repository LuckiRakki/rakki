// Tag groups: genres that belong together, worked out from the library itself, so a mix stays
// one kind of music (Rock never lands in a Hip Hop mix) while close neighbours share one
// (Plugg with Cloud Rap, Slacker Rock with Incelcore).
//
// Each artist has a tag profile (Last.fm's top tags for them, plus the genre tags on their
// songs). Two tags are alike when the same artists carry both (cosine over the artists'
// weights), whatever the words. Alike tags are joined bottom-up (average linkage, so one
// broad tag can't chain everything together) until no two groups are alike enough. An artist
// belongs to the group holding most of its tag weight.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.Rakki.LastFm;

namespace Jellyfin.Plugin.Rakki.DailyMix
{
    public sealed class TagGroup
    {
        public int          Id      { get; init; }
        /// <summary>The group's tags, strongest first.</summary>
        public List<string> Tags    { get; init; } = new();
        public string       Label   => string.Join(", ", Tags.Take(3));
        public List<string> Artists { get; } = new();
        public int          SongCount { get; set; }
    }

    public sealed class TagGroups
    {
        /// <summary>Tags that say nothing about the sound.</summary>
        private static readonly HashSet<string> Junk = new(StringComparer.Ordinal)
        {
            "seen live", "favorites", "favourites", "favorite", "favourite", "love", "loved", "awesome",
            "beautiful", "cool", "good", "great", "best", "amazing", "albums i own", "my music", "all",
            "male vocalists", "female vocalists", "male vocalist", "female vocalist", "vocalists",
            "american", "usa", "british", "uk", "english", "canadian", "australian", "german", "french",
            "japanese", "korean", "swedish", "spotify", "music", "under 2000 listeners", "other",
            "unknown", "misc", "various", "various artists", "soundtrack", "check out", "fucking awesome",
            "atlanta", "chicago", "new york", "los angeles", "california", "texas", "florida", "detroit",
        };

        private static readonly Regex Decade = new(@"^(\d0s|\d{4}s?|\d{2}s)$", RegexOptions.Compiled);

        /// <summary>Most tags kept for grouping (the rest are too rare to matter).</summary>
        private const int MaxTags = 300;

        public List<TagGroup> Groups { get; } = new();
        public Dictionary<string, int> TagGroupOf { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, int> ArtistGroupOf { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, Dictionary<string, double>> Profiles { get; private set; } = new();
        private double[,] _link = new double[0, 0];

        /// <summary>How alike two groups are (0–1).</summary>
        public double Link(int a, int b) => a == b ? 1 : _link[a, b];

        public static string NormTag(string tag)
        {
            var s = Library.Clean(tag).ToLowerInvariant();
            s = Regex.Replace(s, @"[-_./]+", " ");
            s = Regex.Replace(s, @"\s+", " ").Trim();
            s = s switch
            {
                "hiphop" or "hip hop music" => "hip hop",
                "rnb" or "r b" or "r and b" or "rhythm and blues" => "r&b",
                "alt rock" or "alternative rock music" => "alternative rock",
                "alt" => "alternative",
                _ => s,
            };
            return s;
        }

        private static bool Useful(string tag, string artistKey) =>
            tag.Length > 1 && !Junk.Contains(tag) && !Decade.IsMatch(tag) && Library.NameKey(tag) != artistKey;

        /// <summary>An artist's tags and how much of the artist each is (adds up to 1).</summary>
        public static Dictionary<string, double> Profile(IReadOnlyList<LastFmTag>? lastFm, Artist artist)
        {
            var w = new Dictionary<string, double>(StringComparer.Ordinal);
            if (lastFm != null)
            {
                foreach (var t in lastFm.Where(t => t.Count >= 10).Take(10))
                {
                    var tag = NormTag(t.Name);
                    if (Useful(tag, artist.Key)) w[tag] = w.GetValueOrDefault(tag) + t.Count / 100.0;
                }
            }
            if (artist.Songs.Count > 0)
            {
                foreach (var g in artist.Songs.SelectMany(s => s.Genres).GroupBy(g => g))
                {
                    if (!Useful(g.Key, artist.Key)) continue;
                    w[g.Key] = w.GetValueOrDefault(g.Key) + 0.8 * g.Count() / artist.Songs.Count;
                }
            }
            var sum = w.Values.Sum();
            if (sum <= 0) return w;
            foreach (var k in w.Keys.ToList()) w[k] /= sum;
            return w;
        }

        public static double Cosine(Dictionary<string, double> a, Dictionary<string, double> b)
        {
            double dot = 0, na = 0, nb = 0;
            foreach (var (k, v) in a)
            {
                na += v * v;
                if (b.TryGetValue(k, out var u)) dot += v * u;
            }
            foreach (var v in b.Values) nb += v * v;
            return na > 0 && nb > 0 ? dot / Math.Sqrt(na * nb) : 0;
        }

        public static TagGroups Build(Dictionary<string, Dictionary<string, double>> profiles, Library library, double likeness)
        {
            var result = new TagGroups { Profiles = profiles };

            // Tags carried by at least two artists, heaviest first.
            var mass = new Dictionary<string, double>(StringComparer.Ordinal);
            var carriers = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var p in profiles.Values)
            {
                foreach (var (t, w) in p)
                {
                    mass[t] = mass.GetValueOrDefault(t) + w;
                    carriers[t] = carriers.GetValueOrDefault(t) + 1;
                }
            }
            var tags = mass.Where(kv => carriers[kv.Key] >= 2).OrderByDescending(kv => kv.Value).Take(MaxTags).Select(kv => kv.Key).ToList();
            var index = tags.Select((t, i) => (t, i)).ToDictionary(x => x.t, x => x.i, StringComparer.Ordinal);
            var n = tags.Count;

            // Each tag as a vector over artists; likeness = cosine.
            var vectors = new Dictionary<int, double>[n];
            for (var i = 0; i < n; i++) vectors[i] = new();
            var artistNo = 0;
            foreach (var p in profiles.Values)
            {
                foreach (var (t, w) in p) if (index.TryGetValue(t, out var i)) vectors[i][artistNo] = w;
                artistNo++;
            }
            var norm = vectors.Select(v => Math.Sqrt(v.Values.Sum(x => x * x))).ToArray();
            var sim = new double[n, n];
            for (var i = 0; i < n; i++)
            {
                for (var j = i + 1; j < n; j++)
                {
                    var (small, big) = vectors[i].Count <= vectors[j].Count ? (vectors[i], vectors[j]) : (vectors[j], vectors[i]);
                    double dot = 0;
                    foreach (var (a, w) in small) if (big.TryGetValue(a, out var u)) dot += w * u;
                    sim[i, j] = sim[j, i] = norm[i] > 0 && norm[j] > 0 ? dot / (norm[i] * norm[j]) : 0;
                }
            }

            // Average-linkage joining.
            var clusters = Enumerable.Range(0, n).Select(i => new List<int> { i }).ToList();
            var s = (double[,])sim.Clone();
            var alive = Enumerable.Repeat(true, n).ToArray();
            while (true)
            {
                double best = likeness;
                int bi = -1, bj = -1;
                for (var i = 0; i < n; i++)
                {
                    if (!alive[i]) continue;
                    for (var j = i + 1; j < n; j++)
                    {
                        if (alive[j] && s[i, j] > best)
                        {
                            best = s[i, j];
                            bi = i;
                            bj = j;
                        }
                    }
                }
                if (bi < 0) break;
                int ni = clusters[bi].Count, nj = clusters[bj].Count;
                for (var k = 0; k < n; k++)
                {
                    if (!alive[k] || k == bi || k == bj) continue;
                    s[bi, k] = s[k, bi] = (ni * s[bi, k] + nj * s[bj, k]) / (ni + nj);
                }
                clusters[bi].AddRange(clusters[bj]);
                clusters[bj].Clear();
                alive[bj] = false;
            }

            var live = Enumerable.Range(0, n).Where(i => alive[i]).ToList();
            foreach (var c in live)
            {
                var g = new TagGroup { Id = result.Groups.Count, Tags = clusters[c].OrderByDescending(i => mass[tags[i]]).Select(i => tags[i]).ToList() };
                result.Groups.Add(g);
                foreach (var t in g.Tags) result.TagGroupOf[t] = g.Id;
            }
            result._link = new double[live.Count, live.Count];
            for (var a = 0; a < live.Count; a++)
                for (var b = 0; b < live.Count; b++)
                    result._link[a, b] = a == b ? 1 : s[live[a], live[b]];

            // Artists: the group holding most of their tag weight.
            foreach (var (artist, p) in profiles)
            {
                var g = result.Strongest(p);
                if (g is int id)
                {
                    result.ArtistGroupOf[artist] = id;
                    result.Groups[id].Artists.Add(artist);
                }
            }
            foreach (var song in library.Songs)
            {
                if (result.GroupOfSong(song) is int id) result.Groups[id].SongCount++;
            }
            return result;
        }

        private int? Strongest(Dictionary<string, double> profile)
        {
            var by = new Dictionary<int, double>();
            foreach (var (t, w) in profile) if (TagGroupOf.TryGetValue(t, out var g)) by[g] = by.GetValueOrDefault(g) + w;
            return by.Count == 0 ? null : by.OrderByDescending(kv => kv.Value).First().Key;
        }

        /// <summary>
        /// A song's group: its artist's, unless the song's own genre tags clearly belong elsewhere
        /// (none in the artist's group, most in one other).
        /// </summary>
        public int? GroupOfSong(Song song)
        {
            int? artistGroup = ArtistGroupOf.TryGetValue(song.ArtistKey, out var a) ? a : null;
            var own = song.Genres.Where(TagGroupOf.ContainsKey).Select(g => TagGroupOf[g]).ToList();
            if (own.Count == 0 || (artistGroup is int ag && own.Contains(ag))) return artistGroup;
            var top = own.GroupBy(g => g).OrderByDescending(g => g.Count()).First();
            return top.Count() * 2 > own.Count || artistGroup == null ? top.Key : artistGroup;
        }
    }
}
