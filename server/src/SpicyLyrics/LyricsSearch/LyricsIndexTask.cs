// LyricsSearch/LyricsIndexTask.cs
// Builds the lyrics search index at server startup and again every night (after the
// 3 AM scraper and 4 AM API refresh, so new lyrics are included).

using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics.LyricsSearch
{
    public class LyricsIndexTask : IScheduledTask
    {
        private readonly LyricsIndex _index;

        public LyricsIndexTask(LyricsIndex index) => _index = index;

        public string Name        => "Build lyrics search index";
        public string Key         => "SpicyLyricsSearchIndex";
        public string Description => "Reads every song's lyrics so apps can find songs by their words.";
        public string Category    => "Spicy Lyrics";

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() => new[]
        {
            new TaskTriggerInfo { Type = TaskTriggerInfoType.StartupTrigger },
            new TaskTriggerInfo
            {
                Type           = TaskTriggerInfoType.DailyTrigger,
                TimeOfDayTicks = TimeSpan.FromHours(5).Ticks,
            },
        };

        public Task ExecuteAsync(IProgress<double> progress, CancellationToken ct) => _index.BuildAsync(progress, ct);
    }
}
