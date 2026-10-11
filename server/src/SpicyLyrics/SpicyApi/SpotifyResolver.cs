// SpicyApi/SpotifyResolver.cs
// ─────────────────────────────────────────────────────────────────────────────
// Maps a local Jellyfin Audio item to a Spotify track ID, because the Spicy
// Lyrics API only accepts Spotify IDs.
//
// The Spotify Web API now requires a Premium account, so instead of searching
// Spotify we read the Spotify link that MusicBrainz already stores for many
// recordings. No Spotify account or key is needed.
//
// Strategy, most exact first:
//   1. A "Spotify" provider id already on the item (manual override).
//   2. MusicBrainz recording MBID (from the file's tags) → MusicBrainz
//      url-rels → the "open.spotify.com/track/…" streaming link.
//
// Jellyfin stores the recording MBID under either "MusicBrainzRecording" or,
// following Picard's convention, "MusicBrainzTrack", so both are tried.
//
// The mapping is plain metadata about the user's own files, so it is cached
// permanently by SpicyLyricsService (misses are retried after a while).
// ─────────────────────────────────────────────────────────────────────────────

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Rakki.Configuration;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics.SpicyApi
{
    public readonly record struct SpotifyMatch(string SpotifyId, string Method);

    public class SpotifyResolver
    {
        private const string UserAgent =
            "SpicyLyricsJellyfin/1.1 ( https://github.com/LuckiRakki/SpicyLyrics-Jellyfin )";

        // Matches a Spotify track id inside a MusicBrainz "resource" URL.
        private static readonly Regex SpotifyTrackUrl = new(
            @"open\.spotify\.com/(?:intl-[a-z]+/)?track/([A-Za-z0-9]{22})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private readonly IHttpClientFactory _http;
        private readonly ILogger<SpotifyResolver> _logger;

        // MusicBrainz asks for at most 1 request/second per client.
        private readonly SemaphoreSlim _mbLock = new(1, 1);
        private DateTime _mbLastCallUtc = DateTime.MinValue;

        public SpotifyResolver(IHttpClientFactory http, ILogger<SpotifyResolver> logger)
        {
            _http   = http;
            _logger = logger;
        }

        /// <summary>
        /// Returns the Spotify match, or null when nothing trustworthy was found.
        /// Throws only on cancellation; transport hiccups yield null so the miss
        /// is retried later rather than cached as a hard failure.
        /// </summary>
        public async Task<SpotifyMatch?> ResolveAsync(Audio item, PluginConfiguration cfg, CancellationToken ct)
        {
            if (item.TryGetProviderId("Spotify", out var manual) && IsSpotifyId(manual))
                return new SpotifyMatch(manual!, "provider-id");

            foreach (var mbid in CandidateRecordingMbids(item))
            {
                var id = await SpotifyIdFromMusicBrainzAsync(mbid, cfg, ct).ConfigureAwait(false);
                if (id is not null) return new SpotifyMatch(id, "musicbrainz");
            }
            return null;
        }

        /// <summary>Recording MBIDs from the item's provider ids, most-specific first.</summary>
        private static IEnumerable<string> CandidateRecordingMbids(Audio item)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var key in new[]
                     {
                         MetadataProvider.MusicBrainzRecording.ToString(),
                         MetadataProvider.MusicBrainzTrack.ToString(),
                     })
            {
                if (item.TryGetProviderId(key, out var v) && IsMbid(v) && seen.Add(v!))
                    yield return v!;
            }
        }

        private async Task<string?> SpotifyIdFromMusicBrainzAsync(string mbid, PluginConfiguration cfg, CancellationToken ct)
        {
            await _mbLock.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                var wait = _mbLastCallUtc.AddMilliseconds(1100) - DateTime.UtcNow;
                if (wait > TimeSpan.Zero) await Task.Delay(wait, ct).ConfigureAwait(false);
                _mbLastCallUtc = DateTime.UtcNow;

                var url = $"https://musicbrainz.org/ws/2/recording/{Uri.EscapeDataString(mbid)}?inc=url-rels&fmt=json";
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.UserAgent.ParseAdd(UserAgent);

                var client = _http.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(Math.Clamp(cfg.ScraperTimeoutSeconds, 3, 120));

                using var resp = await client.SendAsync(req, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) return null;   // 404 = wrong-kind MBID; skip

                // The Spotify link lives in a relation's url.resource; a plain
                // regex over the whole document is enough and format-agnostic.
                var json = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
                var m = SpotifyTrackUrl.Match(json);
                return m.Success ? m.Groups[1].Value : null;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogDebug(ex, "MusicBrainz lookup failed for {Mbid}", mbid);
                return null;
            }
            finally
            {
                _mbLock.Release();
            }
        }

        internal static bool IsSpotifyId(string? id) =>
            id is not null && id.Length == 22 && id.All(char.IsAsciiLetterOrDigit);

        private static bool IsMbid(string? id) =>
            id is not null && Guid.TryParse(id, out _);
    }

    public class RateLimitedException : Exception
    {
        public RateLimitedException(string service, TimeSpan? retryAfter)
            : base($"{service} rate limit hit" + (retryAfter is null ? "." : $"; retry after {retryAfter.Value.TotalSeconds:0}s."))
        {
            RetryAfter = retryAfter;
        }

        public TimeSpan? RetryAfter { get; }
    }
}
