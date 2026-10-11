// The plugin's settings, saved by Jellyfin as
// /config/data/plugins/configurations/Jellyfin.Plugin.Rakki.xml.

using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Rakki.Configuration
{
    public class PluginConfiguration : BasePluginConfiguration
    {
        /// <summary>The user's own Last.fm API key (last.fm/api/account/create). Never sent to apps.</summary>
        public string LastFmApiKey { get; set; } = string.Empty;

        /// <summary>The Jellyfin user the mixes are built for (empty: the first administrator).</summary>
        public string MixUserId { get; set; } = string.Empty;

        public int MixCount { get; set; } = 6;

        public int MixSize { get; set; } = 100;

        /// <summary>An artist needs at least this many plays of their songs to lead a mix.</summary>
        public int LeadMinPlays { get; set; } = 5;

        /// <summary>Days an artist who led a mix waits before leading again (the 3-day rule).</summary>
        public int LeadRestDays { get; set; } = 3;

        /// <summary>
        /// How alike two genre tags must be (0–1, by the artists that carry both) to share a tag
        /// group. Higher: more, narrower groups.
        /// </summary>
        public double TagGroupLikeness { get; set; } = 0.22;
    }
}
