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

        // ── Lyrics (merged from the Spicy Lyrics TTML plugin) ───────────────

        /// <summary>
        /// File extensions (in priority order) to probe for a TTML sidecar
        /// alongside an audio file.
        /// </summary>
        public string[] FileExtensions { get; set; } = new[] { ".ttml", ".xml" };

        // ── Scraper (nightly TTML fetcher) ──────────────────────────────────

        /// <summary>Master switch for the nightly scraper task. Off by default.</summary>
        public bool ScraperEnabled { get; set; }

        /// <summary>Don't overwrite a sidecar that already exists.</summary>
        public bool ScraperSkipExisting { get; set; } = true;

        /// <summary>Per-request timeout when calling KPoe mirrors.</summary>
        public int ScraperTimeoutSeconds { get; set; } = 15;

        /// <summary>Comma-separated provider preference passed to KPoe.</summary>
        public string ScraperSourcePref { get; set; }
            = "apple,lyricsplus,musixmatch,spotify,qq,deezer,musixmatch-word";

        /// <summary>KPoe / LyricsPlus mirrors, tried in order (first reachable wins).</summary>
        public string[] ScraperKPoeServers { get; set; } = new[]
        {
            "https://lyricsplus.binimum.org",
            "https://lyricsplus-seven.vercel.app",
            "https://lyricsplus.prjktla.workers.dev",
            "https://lyrics-plus-backend.vercel.app",
        };

        // ── Spicy Lyrics API (fallback when a track has no sidecar) ─────────

        /// <summary>Master switch. Off until a key is entered.</summary>
        public bool SpicyApiEnabled { get; set; }

        /// <summary>Secret key (sl_sk_…) from developers.spicylyrics.org.</summary>
        public string SpicyApiKey { get; set; } = string.Empty;

        /// <summary>
        /// When true, the Spicy Lyrics API is tried before the local .ttml
        /// sidecar (the sidecar becomes the fallback). When false, the API only
        /// fills gaps for tracks that have no sidecar. Either way, a synced
        /// sidecar is never replaced by unsynced API text.
        /// </summary>
        public bool SpicyApiPriority { get; set; }

        /// <summary>Fetch live on first play when nothing is cached yet.</summary>
        public bool SpicyFetchOnPlay { get; set; } = true;

        /// <summary>
        /// Cached API lyrics older than this are refreshed by the nightly task.
        /// Clamped below the Terms' hard 30-day limit, after which anything
        /// not refreshed is deleted.
        /// </summary>
        public int SpicyRefreshAfterDays { get; set; } = 25;

        /// <summary>Spicy Lyrics requests per nightly run (refreshes first, then new tracks).</summary>
        public int SpicyMaxRequestsPerRun { get; set; } = 500;

        /// <summary>
        /// The old Spicy Lyrics TTML plugin's settings and saved data were taken over (once, at
        /// the first start; see Migration.cs).
        /// </summary>
        public bool SpicyLyricsImported { get; set; }
    }
}
