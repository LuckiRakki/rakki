// "Rakki Daily Mixes" in Dashboard → Scheduled Tasks: builds and publishes the day's mixes at
// 12 AM (or whenever "Run" is pressed). A day that was already published early (Publish now on
// the plugin's page) is left as it is.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.DailyMix
{
    public class DailyMixTask : IScheduledTask
    {
        private readonly MixService _mixes;
        private readonly ILogger<DailyMixTask> _logger;

        public DailyMixTask(MixService mixes, ILogger<DailyMixTask> logger)
        {
            _mixes = mixes;
            _logger = logger;
        }

        public string Name        => "Rakki Daily Mixes";
        public string Key         => "RakkiDailyMixes";
        public string Description => "Builds today's Daily Mixes and writes them to the [Rakki] Daily Mix playlists.";
        public string Category    => "Rakki";

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() => new[]
        {
            new TaskTriggerInfo { Type = TaskTriggerInfoType.DailyTrigger, TimeOfDayTicks = TimeSpan.Zero.Ticks },
        };

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken ct)
        {
            if (!Guid.TryParse(Plugin.Instance?.Configuration.MixUserId, out var user))
            {
                _logger.LogWarning("Rakki: no user for Daily Mixes yet; open the preview on the plugin's page once, or set one there");
                return;
            }
            var today = DateOnly.FromDateTime(DateTime.Now);
            var key = today.ToString("yyyy-MM-dd");
            if (MixHistory.Load(user).Days.Any(d => d.Date == key && d.Published))
            {
                _logger.LogInformation("Rakki: Daily Mixes for {Date} were already published", key);
                return;
            }
            progress.Report(5);
            await _mixes.PublishAsync(user, today, ct).ConfigureAwait(false);
            progress.Report(100);
        }
    }
}
