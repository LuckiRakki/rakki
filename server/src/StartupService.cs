// Runs when Jellyfin starts: takes over the old Spicy Lyrics plugin's settings (once), starts
// noting skips, and makes today's Daily Mixes if the night's run didn't (the server was off at
// midnight, or the run failed).

using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Rakki.DailyMix;
using Jellyfin.Plugin.Rakki.Skips;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki
{
    public sealed class StartupService : IHostedService
    {
        private readonly IApplicationPaths _paths;
        private readonly SkipTracker _skips;
        private readonly MixService _mixes;
        private readonly ILogger<StartupService> _logger;
        private readonly CancellationTokenSource _stopping = new();

        public StartupService(IApplicationPaths paths, SkipTracker skips, MixService mixes, ILogger<StartupService> logger)
        {
            _paths = paths;
            _skips = skips;
            _mixes = mixes;
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            Migration.ImportSpicyLyrics(_paths, _logger);
            _skips.Start();
            _ = CatchUpDailyMixesAsync(_stopping.Token);
            return Task.CompletedTask;
        }

        /// <summary>Today's mixes, if they're missing (a few minutes after start, once the library has loaded).</summary>
        private async Task CatchUpDailyMixesAsync(CancellationToken ct)
        {
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(3), ct).ConfigureAwait(false);
                if (!Guid.TryParse(Plugin.Instance?.Configuration.MixUserId, out var user)) return;
                var today = DailyMixTask.DayFor(DateTime.Now);
                var key = today.ToString("yyyy-MM-dd");
                if (MixHistory.Load(user).Days.Any(d => d.Date == key && d.Published)) return;
                _logger.LogInformation("Rakki: no Daily Mixes for {Date} yet; making them now", key);
                await _mixes.PublishAsync(user, today, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                // Jellyfin is shutting down.
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Rakki: catching up on Daily Mixes failed");
            }
        }

        public Task StopAsync(CancellationToken cancellationToken)
        {
            _stopping.Cancel();
            _skips.Save();
            return Task.CompletedTask;
        }
    }
}
