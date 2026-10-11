// Runs Daily Mix builds. The first build looks up every artist's tags on Last.fm (several
// minutes; kept 30 days after that), so a build runs in the background and the preview
// endpoint reports its progress until it's done. One build at a time. Publishing (the plugin
// page's "Publish now", or the 12 AM task) writes a build to the playlists (MixPublisher).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Rakki.LastFm;
using Jellyfin.Plugin.Rakki.Skips;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.DailyMix
{
    public sealed class MixStatus
    {
        public bool        Ready    { get; set; }
        public bool        Running  { get; set; }
        public string      Stage    { get; set; } = string.Empty;
        public string?     Error    { get; set; }
        public MixPreview? Result   { get; set; }
        /// <summary>This day's mixes are on the playlists already.</summary>
        public bool        Published { get; set; }
    }

    public class MixService
    {
        private readonly ILibraryManager _library;
        private readonly IUserDataManager _userData;
        private readonly IUserManager _users;
        private readonly LastFmClient _lastFm;
        private readonly SkipTracker _skips;
        private readonly MixPublisher _publisher;
        private readonly ILogger<MixService> _logger;
        private readonly object _lock = new();

        private string? _key;
        private Task<MixPreview>? _running;
        private string _stage = string.Empty;
        private string? _error;
        private MixPreview? _done;

        public MixService(ILibraryManager library, IUserDataManager userData, IUserManager users, LastFmClient lastFm, SkipTracker skips, MixPublisher publisher, ILogger<MixService> logger)
        {
            _library = library;
            _userData = userData;
            _users = users;
            _lastFm = lastFm;
            _skips = skips;
            _publisher = publisher;
            _logger = logger;
        }

        /// <summary>
        /// The preview for a user and day: the finished result, or the running build's progress
        /// (starting one when needed; <paramref name="refresh"/> starts a new one regardless).
        /// <paramref name="publish"/>: also write it to the playlists (the preview already shown
        /// is the one published, unless <paramref name="refresh"/>).
        /// </summary>
        public MixStatus Preview(Guid user, DateOnly date, bool refresh, bool publish = false)
        {
            var key = $"{user:N}|{date:yyyy-MM-dd}";
            var dateKey = date.ToString("yyyy-MM-dd");
            bool Published() => MixHistory.Load(user).Days.Any(d => d.Date == dateKey && d.Published);
            lock (_lock)
            {
                if (_running is { IsCompleted: false })
                {
                    return new MixStatus { Running = true, Stage = _key == key ? _stage : "Busy with another build: " + _stage };
                }
                if (!refresh && !publish && _key == key && (_done != null || _error != null))
                {
                    return new MixStatus { Ready = _done != null, Result = _done, Error = _error, Published = Published() };
                }
                var reuse = publish && !refresh && _key == key ? _done : null;
                _key = key;
                _done = null;
                _error = null;
                _stage = publish ? "Publishing" : "Starting";
                _running = Task.Run(async () =>
                {
                    var built = reuse ?? await BuildAsync(user, date, CancellationToken.None).ConfigureAwait(false);
                    if (publish)
                    {
                        lock (_lock) _stage = "Writing the playlists";
                        await _publisher.PublishAsync(built, CancellationToken.None).ConfigureAwait(false);
                    }
                    return built;
                });
                _running.ContinueWith(
                    t =>
                    {
                        lock (_lock)
                        {
                            if (t.IsFaulted)
                            {
                                _error = t.Exception?.GetBaseException().Message ?? "Failed.";
                                _logger.LogError(t.Exception, "Rakki: Daily Mix build failed");
                            }
                            else
                            {
                                _done = t.Result;
                            }
                        }
                    },
                    TaskScheduler.Default);
                return new MixStatus { Running = true, Stage = _stage };
            }
        }

        /// <summary>Builds a day's mixes and writes them to the playlists (the nightly task).</summary>
        public async Task PublishAsync(Guid user, DateOnly date, CancellationToken ct)
        {
            var built = await BuildAsync(user, date, ct).ConfigureAwait(false);
            await _publisher.PublishAsync(built, ct).ConfigureAwait(false);
        }

        /// <summary>Builds a day's mixes (nothing is written to the server).</summary>
        public async Task<MixPreview> BuildAsync(Guid user, DateOnly date, CancellationToken ct)
        {
            var cfg = Plugin.Instance?.Configuration ?? throw new InvalidOperationException("Plugin not initialised.");
            if (!LastFmClient.HasKey) throw new InvalidOperationException("Add your Last.fm API key in Dashboard → Plugins → Rakki first.");
            var clock = Stopwatch.StartNew();
            var requestsBefore = _lastFm.Requests;
            var now = DateTime.UtcNow;
            void Stage(string s)
            {
                lock (_lock) _stage = s;
            }

            Stage("Reading the library");
            var lib = Library.Read(_library, _userData, _users, user, now, _skips.For(user));

            // Tag profiles: Last.fm tags for artists with 2+ songs or any plays; the rest go by their songs' genres.
            var lookUp = lib.Artists.Values.Where(a => a.Songs.Count >= 2 || a.Plays > 0).ToList();
            var profiles = new Dictionary<string, Dictionary<string, double>>(StringComparer.Ordinal);
            var done = 0;
            try
            {
                foreach (var a in lib.Artists.Values)
                {
                    ct.ThrowIfCancellationRequested();
                    List<LastFmTag>? tags = null;
                    if (a.Songs.Count >= 2 || a.Plays > 0)
                    {
                        if (done % 25 == 0) Stage($"Last.fm tags: {done} of {lookUp.Count} artists");
                        try
                        {
                            tags = await _lastFm.ArtistTagsAsync(a.Name, ct).ConfigureAwait(false);
                        }
                        catch (LastFmException e) when (e.Code != 10 && e.Code != 26)
                        {
                            _logger.LogDebug("Rakki: no Last.fm tags for {Artist}: {Message}", a.Name, e.Message);
                        }
                        done++;
                    }
                    var p = TagGroups.Profile(tags, a);
                    if (p.Count > 0) profiles[a.Key] = p;
                }
            }
            finally
            {
                _lastFm.Save();
            }

            Stage("Grouping tags");
            var groups = TagGroups.Build(profiles, lib, cfg.TagGroupLikeness);

            var preview = new MixPreview
            {
                Date    = date.ToString("yyyy-MM-dd"),
                UserId  = user,
                Songs   = lib.Songs.Count,
                Artists = lib.Artists.Count,
                Groups  = groups.Groups.Where(g => g.SongCount > 0).OrderByDescending(g => g.SongCount).Select(g => new GroupInfo
                {
                    Id = g.Id, Label = g.Label, Tags = g.Tags.Take(10).ToList(), Artists = g.Artists.Count, Songs = g.SongCount,
                }).ToList(),
            };
            try
            {
                var builder = new MixBuilder(lib, groups, _lastFm, cfg, MixHistory.Load(user), date, user, now);
                await builder.BuildAsync(preview, new Progress<string>(Stage), ct).ConfigureAwait(false);
            }
            finally
            {
                _lastFm.Save();
            }
            preview.BuiltUtc = DateTime.UtcNow;
            preview.Seconds = Math.Round(clock.Elapsed.TotalSeconds, 1);
            preview.LastFmRequests = _lastFm.Requests - requestsBefore;
            _logger.LogInformation("Rakki: built {Count} Daily Mixes for {Date} in {Seconds}s ({Requests} Last.fm requests)",
                preview.Mixes.Count, preview.Date, preview.Seconds, preview.LastFmRequests);
            return preview;
        }
    }
}
