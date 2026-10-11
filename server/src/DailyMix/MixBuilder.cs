// Builds one night's Daily Mixes (docs/DAILY_MIX.md, "How a mix is built"):
// 1. Leads: a weighted draw, not "most played" (familiar, a little extra for niche artists,
//    enough room in their tag group), never an artist who led in the last 3 days, and each lead
//    from a different tag group.
// 2. Neighbourhood: the lead plus the artists you have that Last.fm calls similar and that sit
//    in the same tag group (a little from the closest other group, at most 15%).
// 3. Pools, 2:2:1: Popular (Last.fm plays), Yours (your plays lately), New (niche on Last.fm,
//    recently added or never played). A song lands in one pool only.
// Songs you skip a lot are left out, and ones you skip sometimes rank lower.
// 4. Order: a lead song you play a lot first, then P, Y, P, Y, N, no artist twice within 3.
// The draw is seeded by the date and user, so a day's preview and its build agree.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Rakki.Configuration;
using Jellyfin.Plugin.Rakki.LastFm;

namespace Jellyfin.Plugin.Rakki.DailyMix
{
    public sealed class MixBuilder
    {
        private const double MinSimilar = 0.25;
        private const int MinGroupSongs = 60;
        private const int MinLeadSongs = 3;
        private const int TopTrackArtists = 40;

        private readonly Library _lib;
        private readonly TagGroups _groups;
        private readonly LastFmClient _lastFm;
        private readonly PluginConfiguration _cfg;
        private readonly MixHistory _history;
        private readonly DateOnly _date;
        private readonly DateTime _now;
        private readonly Random _rng;
        private readonly HashSet<string> _topTracksDone = new(StringComparer.Ordinal);

        public MixBuilder(Library lib, TagGroups groups, LastFmClient lastFm, PluginConfiguration cfg, MixHistory history, DateOnly date, Guid user, DateTime now)
        {
            _lib = lib;
            _groups = groups;
            _lastFm = lastFm;
            _cfg = cfg;
            _history = history;
            _date = date;
            _now = now;
            _rng = new Random(Seed(date.ToString("yyyy-MM-dd") + user.ToString("N")));
        }

        private static int Seed(string s)
        {
            unchecked
            {
                var h = (int)2166136261;
                foreach (var c in s) h = (h ^ c) * 16777619;
                return h;
            }
        }

        private sealed class Candidate
        {
            public Artist Artist { get; init; } = null!;
            public int    Group  { get; init; }
            public long   Listeners { get; init; }
            public double Score  { get; init; }
        }

        public async Task BuildAsync(MixPreview into, IProgress<string> stage, CancellationToken ct)
        {
            var size = Math.Clamp(_cfg.MixSize, 10, 500);
            var count = Math.Clamp(_cfg.MixCount, 1, 12);

            // ── 1. Leads ──────────────────────────────────────────────────────────────
            var restSince = _date.AddDays(-Math.Max(0, _cfg.LeadRestDays)).ToString("yyyy-MM-dd");
            var today = _date.ToString("yyyy-MM-dd");
            var resting = _history.Days
                .Where(d => string.CompareOrdinal(d.Date, restSince) >= 0 && string.CompareOrdinal(d.Date, today) < 0)
                .SelectMany(d => d.Leads).ToHashSet(StringComparer.Ordinal);
            into.Resting = resting.Select(k => _lib.Artists.TryGetValue(k, out var a) ? a.Name : k).ToList();

            var eligible = _lib.Artists.Values
                .Where(a => a.Plays >= _cfg.LeadMinPlays && a.Songs.Count >= MinLeadSongs && !resting.Contains(a.Key))
                .Where(a => _groups.ArtistGroupOf.TryGetValue(a.Key, out var g) && _groups.Groups[g].SongCount >= MinGroupSongs)
                .ToList();
            stage.Report($"Looking up {eligible.Count} possible leads on Last.fm");
            var lately = eligible.Select(a => a.Lately).OrderBy(x => x).ToList();
            var p90 = lately.Count > 0 ? lately[(int)(lately.Count * 0.9)] : 1;
            var candidates = new List<Candidate>();
            foreach (var a in eligible)
            {
                ct.ThrowIfCancellationRequested();
                var listeners = await Safe(() => _lastFm.ArtistListenersAsync(a.Name, ct), 0L).ConfigureAwait(false);
                var group = _groups.ArtistGroupOf[a.Key];
                // Familiar, but flattened at the top so the most played don't always win.
                var familiar = Math.Sqrt(Math.Min(1, Math.Log(1 + a.Lately) / Math.Log(2 + p90)));
                // Niche: ~1.6× at a thousand Last.fm listeners, 1× at ten million.
                var niche = listeners > 0 ? 1 + 0.6 * (1 - Math.Clamp((Math.Log10(listeners) - 3) / 4, 0, 1)) : 1.3;
                var room = Math.Min(1, _groups.Groups[group].SongCount / 200.0) * Math.Min(1, a.Songs.Count / 8.0);
                candidates.Add(new Candidate { Artist = a, Group = group, Listeners = listeners, Score = familiar * niche * room });
            }
            var total = candidates.Sum(c => c.Score);
            into.Candidates = candidates.OrderByDescending(c => c.Score).Take(30).Select(c => new LeadCandidate
            {
                Artist    = c.Artist.Name,
                Group     = _groups.Groups[c.Group].Label,
                Plays     = c.Artist.Plays,
                Listeners = c.Listeners,
                Score     = Math.Round(c.Score, 3),
                ChancePct = total > 0 ? Math.Round(100 * c.Score / total, 2) : 0,
            }).ToList();

            var leads = new List<Candidate>();
            var pool = candidates.ToList();
            while (leads.Count < count && pool.Count > 0)
            {
                var pick = Draw(pool, c => c.Score);
                leads.Add(pick);
                pool.RemoveAll(c => c.Group == pick.Group);
            }
            if (leads.Count < count)
            {
                into.Notes.Add($"Only {leads.Count} tag groups had a lead (artists with {_cfg.LeadMinPlays}+ plays and {MinGroupSongs}+ songs in their group).");
            }

            // ── 2–4. Each mix ─────────────────────────────────────────────────────────
            var yesterday = _history.Days.Where(d => string.CompareOrdinal(d.Date, today) < 0)
                .OrderByDescending(d => d.Date, StringComparer.Ordinal).FirstOrDefault()?.Songs.ToHashSet() ?? new HashSet<Guid>();
            for (var i = 0; i < leads.Count; i++)
            {
                stage.Report($"Building mix {i + 1} of {leads.Count} ({leads[i].Artist.Name})");
                into.Mixes.Add(await BuildMixAsync(i + 1, leads[i], size, yesterday, ct).ConfigureAwait(false));
            }
        }

        private async Task<MixInfo> BuildMixAsync(int number, Candidate lead, int size, HashSet<Guid> yesterday, CancellationToken ct)
        {
            var group = lead.Group;
            var mix = new MixInfo { Number = number, Lead = lead.Artist.Name, Group = _groups.Groups[group].Label };

            // ── Neighbourhood ──
            var like = new Dictionary<string, double>(StringComparer.Ordinal) { [lead.Artist.Key] = 1 };
            var side = new Dictionary<string, double>(StringComparer.Ordinal);
            var sideGroups = new Dictionary<int, double>();
            var similar = await Safe(() => _lastFm.SimilarArtistsAsync(lead.Artist.Name, ct), new List<LastFmSimilar>()).ConfigureAwait(false);
            foreach (var s in similar.Where(s => s.Match >= MinSimilar))
            {
                var key = Library.NameKey(s.Name);
                if (!_lib.Artists.ContainsKey(key) || like.ContainsKey(key) || !_groups.ArtistGroupOf.TryGetValue(key, out var g)) continue;
                if (g == group)
                {
                    like[key] = s.Match;
                }
                else
                {
                    side[key] = s.Match * 0.8;
                    sideGroups[g] = sideGroups.GetValueOrDefault(g) + s.Match;
                }
            }
            // A little variety: only the closest other group, and only its similar artists.
            var sideGroup = sideGroups.Count > 0 ? sideGroups.OrderByDescending(kv => kv.Value).First().Key : -1;
            side = side.Where(kv => _groups.ArtistGroupOf[kv.Key] == sideGroup).ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal);

            bool InMix(Song s) => _groups.GroupOfSong(s) is int g && (g == group || (g == sideGroup && side.ContainsKey(s.ArtistKey)));
            int SongsIn(IEnumerable<string> keys) => keys.Sum(k => _lib.Artists[k].Songs.Count(InMix));

            // Not enough similar artists in the library: add the group's artists whose tags are most like the lead's.
            if (SongsIn(like.Keys) < size * 2 && _groups.Profiles.TryGetValue(lead.Artist.Key, out var leadProfile))
            {
                var more = _groups.Groups[group].Artists
                    .Where(k => !like.ContainsKey(k) && _lib.Artists.ContainsKey(k) && _groups.Profiles.ContainsKey(k))
                    .Select(k => (k, cos: TagGroups.Cosine(leadProfile, _groups.Profiles[k])))
                    .Where(x => x.cos >= 0.3)
                    .OrderByDescending(x => x.cos);
                var have = SongsIn(like.Keys);
                foreach (var (k, cos) in more)
                {
                    if (have >= size * 3) break;
                    like[k] = 0.15 + 0.35 * cos;
                    have += _lib.Artists[k].Songs.Count(InMix);
                }
            }
            foreach (var (k, v) in side) like.TryAdd(k, v);
            mix.Neighbours = like.OrderByDescending(kv => kv.Value).ToDictionary(kv => _lib.Artists[kv.Key].Name, kv => Math.Round(kv.Value, 2));

            // Worldwide plays for the closest artists' songs.
            foreach (var k in like.OrderByDescending(kv => kv.Value).Take(TopTrackArtists).Select(kv => kv.Key))
            {
                if (!_topTracksDone.Add(k)) continue;
                var artist = _lib.Artists[k];
                var top = await Safe(() => _lastFm.TopTracksAsync(artist.Name, ct), new List<LastFmTopTrack>()).ConfigureAwait(false);
                var plays = new Dictionary<string, long>(StringComparer.Ordinal);
                foreach (var t in top) plays.TryAdd(Library.TitleKey(t.Name), t.Playcount);
                foreach (var s in artist.Songs) s.LastFmPlays = plays.TryGetValue(s.TitleKey, out var p) ? p : 0;
            }

            var songs = like.Keys.SelectMany(k => _lib.Artists[k].Songs).Where(InMix).ToList();
            double Like(Song s) => like.GetValueOrDefault(s.ArtistKey);

            // ── Pools ──
            var claimed = new HashSet<Guid>();
            var perArtist = new Dictionary<string, int>(StringComparer.Ordinal);
            var artistCap = (int)Math.Ceiling(size * 0.15);
            var leadCap = (int)Math.Ceiling(size * 0.25);
            var sideCap = (int)Math.Ceiling(size * 0.15);
            var fromYesterdayCap = (int)Math.Floor(size * 0.3);
            int sideUsed = 0, fromYesterday = 0;

            bool Allowed(Song s) =>
                !claimed.Contains(s.Id)
                && perArtist.GetValueOrDefault(s.ArtistKey) < (s.ArtistKey == lead.Artist.Key ? leadCap : artistCap)
                && (!side.ContainsKey(s.ArtistKey) || sideUsed < sideCap)
                && (!yesterday.Contains(s.Id) || fromYesterday < fromYesterdayCap);
            void Claim(Song s)
            {
                claimed.Add(s.Id);
                perArtist[s.ArtistKey] = perArtist.GetValueOrDefault(s.ArtistKey) + 1;
                if (side.ContainsKey(s.ArtistKey)) sideUsed++;
                if (yesterday.Contains(s.Id)) fromYesterday++;
            }

            // A ranked list, drawn from with a lean towards the top (so it changes day to day).
            List<Song> Take(IEnumerable<Song> ranked, int need)
            {
                var avail = ranked.Where(s => !claimed.Contains(s.Id)).ToList();
                var chosen = new List<Song>();
                while (chosen.Count < need && avail.Count > 0)
                {
                    var window = Math.Min(avail.Count, (need - chosen.Count) * 3 + 10);
                    var idx = DrawIndex(window, j => 1.0 / (j + 4));
                    var s = avail[idx];
                    avail.RemoveAt(idx);
                    if (!Allowed(s)) continue;
                    chosen.Add(s);
                    Claim(s);
                }
                return chosen;
            }

            // The opener: a lead song you play a lot.
            var opener = lead.Artist.Songs.Where(InMix).OrderByDescending(s => s.Lately).ThenByDescending(s => s.Plays).FirstOrDefault();
            if (opener != null) Claim(opener);

            var popularNeed = (int)Math.Round(size * 0.4);
            var yoursNeed = (int)Math.Round(size * 0.4) - (opener != null ? 1 : 0);
            var newNeed = size - popularNeed - yoursNeed - (opener != null ? 1 : 0);

            var popular = Take(songs.Where(s => s.LastFmPlays > 0).OrderByDescending(s => s.LastFmPlays * Math.Sqrt(Like(s)) * s.Keep), popularNeed);
            var yours = Take(songs.Where(s => s.Plays > 0 || s.Liked).OrderByDescending(s => s.Lately * Math.Sqrt(Like(s)) * s.Keep), yoursNeed);
            var known = songs.Where(s => s.LastFmPlays > 0).Select(s => s.LastFmPlays).OrderBy(x => x).ToList();
            var nicheCut = known.Count > 0 ? known[known.Count / 2] : long.MaxValue;
            var fresh = Take(
                songs.Where(s => s.LastFmPlays < nicheCut)
                    .Select(s => (s, w: Like(s)
                        * ((_now - s.Added).TotalDays <= 30 ? 1.6 : 1)
                        * (s.Plays == 0 ? 1.4 : 1)
                        * s.Keep
                        * (0.6 + 0.8 * _rng.NextDouble())))
                    .OrderByDescending(x => x.w).Select(x => x.s),
                newNeed);

            // Short somewhere: fill from whatever the neighbourhood has left, yours first.
            var fill = new List<Song>();
            var short_ = size - (opener != null ? 1 : 0) - popular.Count - yours.Count - fresh.Count;
            if (short_ > 0)
            {
                fill = Take(songs.OrderByDescending(s => s.Lately + Like(s) + (s.LastFmPlays > 0 ? Math.Log10(s.LastFmPlays) / 10 : 0)), short_);
                if (fill.Count < short_) mix.Notes.Add($"{short_ - fill.Count} songs short of {size}: the neighbourhood is small.");
            }

            // ── Order ──
            var queues = new Dictionary<char, Queue<Song>>
            {
                ['P'] = new(popular), ['Y'] = new(yours), ['N'] = new(fresh), ['F'] = new(fill),
            };
            var poolOf = new Dictionary<Guid, string>();
            foreach (var s in popular) poolOf[s.Id] = "Popular";
            foreach (var s in yours) poolOf[s.Id] = "Yours";
            foreach (var s in fresh) poolOf[s.Id] = "New";
            foreach (var s in fill) poolOf[s.Id] = "Fill";

            var order = new List<Song>();
            if (opener != null)
            {
                order.Add(opener);
                poolOf[opener.Id] = "Opener";
            }
            const string Pattern = "PYPYN";
            var remaining = queues.Values.Sum(q => q.Count);
            for (var slot = 0; remaining > 0; slot++)
            {
                var want = Pattern[slot % Pattern.Length];
                var tryOrder = new[] { want, 'F' }.Concat("PYN".Where(c => c != want)).ToList();
                var recent = order.Skip(Math.Max(0, order.Count - 3)).Select(s => s.ArtistKey).ToHashSet(StringComparer.Ordinal);
                Song? next = null;
                foreach (var q in tryOrder)
                {
                    next = TakeSpaced(queues[q], recent);
                    if (next != null) break;
                }
                next ??= tryOrder.Select(q => queues[q]).First(q => q.Count > 0).Dequeue();
                order.Add(next);
                remaining--;
            }

            mix.Tracks = order.Select(s => new MixTrack
            {
                Id = s.Id, Name = s.Name, Artist = s.Artist, Pool = poolOf[s.Id], YourPlays = s.Plays, LastFmPlays = Math.Max(0, s.LastFmPlays),
            }).ToList();
            mix.Pools = mix.Tracks.GroupBy(t => t.Pool).ToDictionary(g => g.Key, g => g.Count());
            var listeners = lead.Listeners > 0 ? $"{lead.Listeners:N0} Last.fm listeners" : "unknown on Last.fm";
            mix.Why = $"{lead.Artist.Name}: {lead.Artist.Plays} plays by you, {listeners}; group \"{mix.Group}\"; "
                + $"{like.Count - 1} neighbour artists ({side.Count} from \"{(sideGroup >= 0 ? _groups.Groups[sideGroup].Label : "none")}\").";
            return mix;
        }

        /// <summary>The first song in the queue whose artist isn't among the last three (taken out of the queue).</summary>
        private static Song? TakeSpaced(Queue<Song> q, HashSet<string> recent)
        {
            if (q.Count == 0) return null;
            var list = q.ToList();
            var at = list.FindIndex(s => !recent.Contains(s.ArtistKey));
            if (at < 0) return null;
            var pick = list[at];
            list.RemoveAt(at);
            q.Clear();
            foreach (var s in list) q.Enqueue(s);
            return pick;
        }

        private T Draw<T>(List<T> items, Func<T, double> weight) => items[DrawIndex(items.Count, i => weight(items[i]))];

        private int DrawIndex(int n, Func<int, double> weight)
        {
            var w = new double[n];
            double sum = 0;
            for (var i = 0; i < n; i++) sum += w[i] = Math.Max(0, weight(i));
            if (sum <= 0) return _rng.Next(n);
            var r = _rng.NextDouble() * sum;
            for (var i = 0; i < n; i++)
            {
                r -= w[i];
                if (r <= 0) return i;
            }
            return n - 1;
        }

        /// <summary>A Last.fm answer, or the fallback when Last.fm can't answer (a bad key still stops the build).</summary>
        private static async Task<T> Safe<T>(Func<Task<T>> call, T fallback)
        {
            try
            {
                return await call().ConfigureAwait(false);
            }
            catch (LastFmException e) when (e.Code != 10 && e.Code != 26)
            {
                return fallback;
            }
            catch (System.Net.Http.HttpRequestException)
            {
                return fallback;
            }
        }
    }
}
