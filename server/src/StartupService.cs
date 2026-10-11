// Runs when Jellyfin starts: takes over the old Spicy Lyrics plugin's settings (once) and
// starts noting skips.

using System.Threading;
using System.Threading.Tasks;
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
        private readonly ILogger<StartupService> _logger;

        public StartupService(IApplicationPaths paths, SkipTracker skips, ILogger<StartupService> logger)
        {
            _paths = paths;
            _skips = skips;
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            Migration.ImportSpicyLyrics(_paths, _logger);
            _skips.Start();
            return Task.CompletedTask;
        }

        public Task StopAsync(CancellationToken cancellationToken)
        {
            _skips.Save();
            return Task.CompletedTask;
        }
    }
}
