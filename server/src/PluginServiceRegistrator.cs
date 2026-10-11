// Wires the plugin's services into Jellyfin. Controllers and scheduled tasks are found by
// Jellyfin itself; their dependencies are registered here.

using Jellyfin.Plugin.Rakki.DailyMix;
using Jellyfin.Plugin.Rakki.LastFm;
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
        }
    }
}
