// SpicyApi/SpicyLyricsClient.cs
// ─────────────────────────────────────────────────────────────────────────────
// Thin client for the Spicy Lyrics API:
//   GET https://api.spicylyrics.org/v1/lyrics/{spotifyTrackId}
//   Authorization: Bearer sl_sk_…   (secret key; server-side only)
// Docs: https://developers.spicylyrics.org/docs/reference/get.lyrics
// ─────────────────────────────────────────────────────────────────────────────

using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Rakki.Configuration;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics.SpicyApi
{
    public class SpicyLyricsClient
    {
        private const string BaseUrl = "https://api.spicylyrics.org/v1/lyrics/";

        private readonly IHttpClientFactory _http;

        public SpicyLyricsClient(IHttpClientFactory http)
        {
            _http = http;
        }

        /// <summary>
        /// Returns the raw <c>Body</c> JSON, or null when the API has no lyrics
        /// for this track (404). Throws on auth, rate-limit and server errors so
        /// callers never mistake a failure for "no lyrics".
        /// </summary>
        public async Task<string?> GetLyricsBodyAsync(string spotifyId, PluginConfiguration cfg, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(cfg.SpicyApiKey))
                throw new InvalidOperationException("Spicy Lyrics API key is not configured.");

            using var req = new HttpRequestMessage(HttpMethod.Get, BaseUrl + Uri.EscapeDataString(spotifyId));
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.SpicyApiKey.Trim());
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(Math.Clamp(cfg.ScraperTimeoutSeconds, 3, 120));

            using var resp = await client.SendAsync(req, ct).ConfigureAwait(false);
            switch (resp.StatusCode)
            {
                case HttpStatusCode.NotFound:
                    return null;
                case HttpStatusCode.TooManyRequests:
                    throw new RateLimitedException("Spicy Lyrics", resp.Headers.RetryAfter?.Delta);
                case HttpStatusCode.Unauthorized:
                case HttpStatusCode.Forbidden:
                    throw new InvalidOperationException(
                        $"Spicy Lyrics API rejected the key ({(int)resp.StatusCode}). Check the secret key in plugin settings.");
            }
            resp.EnsureSuccessStatusCode();

            var json = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("Body", out var body) || body.ValueKind != JsonValueKind.Object)
                return null;
            return body.GetRawText();
        }
    }
}
