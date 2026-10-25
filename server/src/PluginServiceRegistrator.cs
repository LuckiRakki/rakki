// Wires the plugin's services into Jellyfin. Controllers and scheduled tasks are found by
// Jellyfin itself; their dependencies are registered here.

using Jellyfin.Plugin.Rakki.DailyMix;
using Jellyfin.Plugin.Rakki.Edits;
using Jellyfin.Plugin.Rakki.LastFm;
using Jellyfin.Plugin.Rakki.Skips;
using Jellyfin.Plugin.Rakki.SpicyLyrics;
using Jellyfin.Plugin.Rakki.SpicyLyrics.LyricsSearch;
using Jellyfin.Plugin.Rakki.SpicyLyrics.Scraping;
using Jellyfin.Plugin.Rakki.SpicyLyrics.SpicyApi;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.Rakki
{
    public class PluginServiceRegistrator : IPluginServiceRegistrator
    {
        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
        {
            serviceCollection.AddHttpClient();
            serviceCollection.AddSingleton<LastFmClient>();
            serviceCollection.AddSingleton<MixService>();
            serviceCollection.AddSingleton<MixPublisher>();
            serviceCollection.AddSingleton<SkipTracker>();
            serviceCollection.AddHostedService<StartupService>();

            // Lyrics (merged from the Spicy Lyrics TTML plugin): .ttml sidecars, the Spicy
            // Lyrics API fallback, the KPoe scraper and lyrics search.
            serviceCollection.AddSingleton<TTMLLyricProvider>();
            serviceCollection.AddSingleton<KPoeClient>();
            serviceCollection.AddSingleton<SpotifyResolver>();
            serviceCollection.AddSingleton<SpicyLyricsClient>();
            serviceCollection.AddSingleton<SpicyLyricsService>();
            serviceCollection.AddSingleton<LyricsIndex>();

            // Audio edits and lyrics made in Rakki, kept apart from the music files.
            serviceCollection.AddSingleton<SongEdits>();
            // Which lyrics each song shows when it has several kinds (0.4).
            serviceCollection.AddSingleton<LyricsSources>();
        }
    }
}
