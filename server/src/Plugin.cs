// The Rakki companion plugin: everything the Rakki app needs from the server, in one place.
// Today: Daily Mixes (docs/DAILY_MIX.md). Settings live in the Dashboard (Plugins → Rakki).

using System;
using System.Collections.Generic;
using Jellyfin.Plugin.Rakki.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Rakki
{
    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        public Plugin(IApplicationPaths appPaths, IXmlSerializer xmlSerializer)
            : base(appPaths, xmlSerializer)
        {
            Instance = this;
        }

        public static Plugin? Instance { get; private set; }

        public override string Name        => "Rakki";
        public override Guid   Id          => new Guid("4aed0f98-72d3-47d4-9a96-8aa90b9669b8");
        public override string Description => "Server features for the Rakki app: Daily Mixes.";

        public IEnumerable<PluginPageInfo> GetPages() => new[]
        {
            new PluginPageInfo
            {
                Name                 = Name,
                EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.config.html",
            },
        };
    }
}
