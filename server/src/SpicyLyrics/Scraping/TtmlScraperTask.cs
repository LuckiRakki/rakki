// Scraping/TtmlScraperTask.cs
// ─────────────────────────────────────────────────────────────────────────────
// Scheduled Task — runs nightly (configurable in Dashboard → Scheduled Tasks).
// For each Audio item in the library, if no "<audio-stem>.ttml" sidecar exists,
// fetch one via KPoe and write it next to the track. Filenames must mirror the
// audio stem exactly because SpicyLyricsController.FindTTMLPath only resolves
// that one shape.
//
// Auto-discovered: Jellyfin scans the plugin assembly for IScheduledTask
// implementations on startup; no manual registration required.
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

namespace Jellyfin.Plugin.Rakki.SpicyLyrics.Scraping
{
    public class TtmlScraperTask : IScheduledTask
    {
        private readonly ILibraryManager _library;
        private readonly KPoeClient      _kpoe;
        private readonly ILogger<TtmlScraperTask> _logger;

        public TtmlScraperTask(
            ILibraryManager library,
            KPoeClient kpoe,
            ILogger<TtmlScraperTask> logger)
        {
            _library = library;
            _kpoe    = kpoe;
            _logger  = logger;
        }

        public string Name        => "Scrape TTML lyrics";
        public string Key         => "SpicyLyricsScrapeTTML";
        public string Description =>
            "Fetch missing word-by-word TTML lyrics from LyricsPlus/KPoe and "
          + "write sidecar files next to each audio track. Off by default — "
          + "enable in the Spicy Lyrics TTML plugin settings.";
        public string Category    => "Spicy Lyrics";

        // Default schedule: nightly at 3 AM. User can change/add triggers in the
        // Scheduled Tasks UI.
        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() => new[]
        {
            new TaskTriggerInfo
            {
                Type            = TaskTriggerInfoType.DailyTrigger,
                TimeOfDayTicks  = TimeSpan.FromHours(3).Ticks,
                MaxRuntimeTicks = TimeSpan.FromHours(6).Ticks,
            },
        };

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken ct)
        {
            var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
            if (!cfg.ScraperEnabled)
            {
                _logger.LogInformation(
                    "Spicy Lyrics scraper is disabled in plugin settings; skipping run.");
                return;
            }
            if (cfg.ScraperKPoeServers is null || cfg.ScraperKPoeServers.Length == 0)
            {
                _logger.LogWarning("No KPoe servers configured; nothing to do.");
                return;
            }

            var items = _library.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { BaseItemKind.Audio },
                Recursive        = true,
            }).OfType<Audio>().ToList();

            _logger.LogInformation(
                "Spicy Lyrics scraper: {Count} audio items in library.", items.Count);

            int scanned = 0, skipped = 0, written = 0, missed = 0;

            for (int i = 0; i < items.Count; i++)
            {
                ct.ThrowIfCancellationRequested();
                progress.Report(100.0 * i / Math.Max(items.Count, 1));

                var audio = items[i];
                scanned++;

                var path = audio.Path;
                if (string.IsNullOrEmpty(path))
                {
                    missed++;
                    continue;
                }

                var sidecar = Path.ChangeExtension(path, ".ttml");
                if (cfg.ScraperSkipExisting && File.Exists(sidecar))
                {
                    skipped++;
                    continue;
                }

                var title  = audio.Name ?? string.Empty;
                var artist = audio.Artists?.FirstOrDefault()
                          ?? audio.AlbumArtists?.FirstOrDefault()
                          ?? string.Empty;
                if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(artist))
                {
                    missed++;
                    continue;
                }

                var query = new TrackQuery
                {
                    Title           = title,
                    Artist          = artist,
                    Album           = audio.Album,
                    DurationSeconds = (audio.RunTimeTicks ?? 0) / (double)TimeSpan.TicksPerSecond,
                };

                try
                {
                    var hit = await _kpoe.FetchAsync(
                        query,
                        cfg.ScraperKPoeServers,
                        cfg.ScraperSourcePref,
                        cfg.ScraperTimeoutSeconds,
                        ct).ConfigureAwait(false);

                    if (hit is null)
                    {
                        missed++;
                        _logger.LogDebug("KPoe miss: {Artist} - {Title}", artist, title);
                        continue;
                    }

                    await File.WriteAllTextAsync(sidecar, hit.Value.Ttml, ct)
                        .ConfigureAwait(false);
                    written++;
                    _logger.LogInformation(
                        "Wrote {Sidecar} via {Source}", sidecar, hit.Value.Source);
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    // Per-track errors must not kill the whole run.
                    missed++;
                    _logger.LogWarning(ex, "Failed: {Artist} - {Title}", artist, title);
                }
            }

            progress.Report(100);
            _logger.LogInformation(
                "Spicy Lyrics scraper done. scanned={Scanned} skipped={Skipped} "
              + "written={Written} missed={Missed}",
                scanned, skipped, written, missed);
        }
    }
}
