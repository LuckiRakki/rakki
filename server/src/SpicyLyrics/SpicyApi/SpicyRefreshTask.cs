// SpicyApi/SpicyRefreshTask.cs
// ─────────────────────────────────────────────────────────────────────────────
// Nightly Scheduled Task that keeps the Spicy Lyrics cache inside the Terms'
// 30-day window without ever making playback wait:
//
//   1. Delete cached lyrics that reached 30 days (always runs, even when the
//      API is disabled, so switching it off can't leave stale data behind).
//   2. Refetch cached entries older than SpicyRefreshAfterDays, oldest first.
//   3. Spend any leftover budget on tracks never fetched before.
//
// Tracks with a local .ttml sidecar are skipped entirely — sidecars win.
// A failed refetch keeps the old copy (it is still < 30 days old) and is
// retried next run. Stops early on a 429.
// ─────────────────────────────────────────────────────────────────────────────

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.Rakki.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics.SpicyApi
{
    public class SpicyRefreshTask : IScheduledTask
    {
        private readonly ILibraryManager _library;
        private readonly SpicyLyricsService _service;
        private readonly ILogger<SpicyRefreshTask> _logger;

        public SpicyRefreshTask(ILibraryManager library, SpicyLyricsService service, ILogger<SpicyRefreshTask> logger)
        {
            _library = library;
            _service = service;
            _logger  = logger;
        }

        public string Name        => "Refresh Spicy Lyrics API cache";
        public string Key         => "SpicyLyricsApiRefresh";
        public string Description =>
            "Keeps lyrics from the Spicy Lyrics API fresh: refetches cached lyrics before they "
          + "reach the 30-day limit, deletes any that do, and fetches lyrics for tracks without "
          + "a .ttml sidecar.";
        public string Category    => "Spicy Lyrics";

        // 4 AM: after the 3 AM TTML scraper, so fresh sidecars are skipped here.
        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() => new[]
        {
            new TaskTriggerInfo
            {
                Type            = TaskTriggerInfoType.DailyTrigger,
                TimeOfDayTicks  = TimeSpan.FromHours(4).Ticks,
                MaxRuntimeTicks = TimeSpan.FromHours(3).Ticks,
            },
        };

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken ct)
        {
            var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();

            var purged = _service.PurgeExpired();
            if (purged > 0) _logger.LogInformation("Spicy Lyrics: deleted {Count} cache entries past 30 days.", purged);

            if (!SpicyLyricsService.IsConfigured(cfg))
            {
                _logger.LogInformation("Spicy Lyrics API is disabled or has no key; only the expiry purge ran.");
                progress.Report(100);
                return;
            }

            var items = _library.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { BaseItemKind.Audio },
                Recursive        = true,
            // With API priority on, pre-warm the cache for every track (sidecars
            // included, since the API can override them); otherwise only tracks
            // that have no sidecar are worth fetching.
            }).OfType<Audio>().Where(a => cfg.SpicyApiPriority || !HasSidecar(a, cfg)).ToList();

            // Refreshes (have a FetchedUtc) oldest first, then never-fetched tracks.
            var due = new List<(Audio Item, DateTime? Fetched)>();
            foreach (var a in items)
            {
                if (SpicyLyricsService.NeedsWork(a, cfg, out var lastFetched)) due.Add((a, lastFetched));
            }
            var queue = due
                .OrderBy(d => d.Fetched is null ? 1 : 0)
                .ThenBy(d => d.Fetched ?? DateTime.MaxValue)
                .Take(Math.Max(1, cfg.SpicyMaxRequestsPerRun))
                .ToList();

            _logger.LogInformation(
                "Spicy Lyrics: {Due} of {Total} sidecar-less tracks need work; processing {Batch} this run.",
                due.Count, items.Count, queue.Count);

            int fetched = 0, notFound = 0, noMatch = 0, failed = 0;
            for (int i = 0; i < queue.Count; i++)
            {
                ct.ThrowIfCancellationRequested();
                progress.Report(100.0 * i / queue.Count);

                try
                {
                    switch (await _service.EnsureAsync(queue[i].Item, cfg, forceRefresh: false, ct).ConfigureAwait(false))
                    {
                        case SpicyLyricsService.EnsureResult.Fetched:        fetched++;  break;
                        case SpicyLyricsService.EnsureResult.NotFound:       notFound++; break;
                        case SpicyLyricsService.EnsureResult.NoSpotifyMatch: noMatch++;  break;
                    }
                }
                catch (OperationCanceledException) { throw; }
                catch (RateLimitedException ex)
                {
                    _logger.LogWarning("{Message} Stopping this run; the rest is picked up tomorrow.", ex.Message);
                    break;
                }
                catch (InvalidOperationException ex)
                {
                    // Bad key / credentials: every further request would fail too.
                    _logger.LogError("Spicy Lyrics run aborted: {Message}", ex.Message);
                    break;
                }
                catch (Exception ex)
                {
                    failed++;
                    _logger.LogWarning("Spicy Lyrics: {Item} failed: {Message}", queue[i].Item.Name, ex.Message);
                }

                // Gentle pacing; ~500 requests still finish in a few minutes.
                await Task.Delay(250, ct).ConfigureAwait(false);
            }

            progress.Report(100);
            _logger.LogInformation(
                "Spicy Lyrics run done. fetched={Fetched} notFound={NotFound} noSpotifyMatch={NoMatch} failed={Failed}",
                fetched, notFound, noMatch, failed);
        }

        private static bool HasSidecar(Audio a, PluginConfiguration cfg)
        {
            if (string.IsNullOrEmpty(a.Path)) return true;   // nothing we could serve anyway
            var dir  = Path.GetDirectoryName(a.Path);
            var stem = Path.GetFileNameWithoutExtension(a.Path);
            if (dir is null) return true;
            foreach (var ext in cfg.FileExtensions ?? new[] { ".ttml", ".xml" })
            {
                if (File.Exists(Path.Combine(dir, stem + ext))) return true;
            }
            return false;
        }
    }
}
