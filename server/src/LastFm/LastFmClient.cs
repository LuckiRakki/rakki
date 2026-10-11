// Last.fm answers the Daily Mixes need: an artist's genre tags, listeners, similar artists and
// most played songs. Uses the key from the plugin's settings. Every answer (including "Last.fm
// doesn't know this artist") is kept 30 days in <plugin data>/lastfm-cache.json, so after the
// first build a night costs only a handful of requests. Requests go one at a time, about four a
// second, well inside Last.fm's limits.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.LastFm
{
    public sealed class LastFmTag
    {
        public string Name  { get; set; } = string.Empty;
        /// <summary>0–100: how strongly Last.fm listeners tag the artist with it.</summary>
        public int    Count { get; set; }
    }

    public sealed class LastFmSimilar
    {
        public string Name  { get; set; } = string.Empty;
        public double Match { get; set; }
    }

    public sealed class LastFmTopTrack
    {
        public string Name      { get; set; } = string.Empty;
        public long   Playcount { get; set; }
    }

    public sealed class LastFmException : Exception
    {
        public LastFmException(string message, int code = 0) : base(message) => Code = code;

        /// <summary>Last.fm's error code (6 = not found, 10 = bad key, 29 = too many requests).</summary>
        public int Code { get; }
    }

    public class LastFmClient
    {
        private const string Api = "https://ws.audioscrobbler.com/2.0/";
        private static readonly TimeSpan Keep = TimeSpan.FromDays(30);
        private static readonly TimeSpan Gap  = TimeSpan.FromMilliseconds(250);

        private sealed class Kept
        {
            public DateTime At { get; set; }
            public JsonElement Value { get; set; }
        }

        private readonly IHttpClientFactory _http;
        private readonly ILogger<LastFmClient> _logger;
        private readonly SemaphoreSlim _one = new(1, 1);
        private readonly object _lock = new();
        private Dictionary<string, Kept>? _cache;
        private int _unsaved;
        private DateTime _last = DateTime.MinValue;

        public LastFmClient(IHttpClientFactory http, ILogger<LastFmClient> logger)
        {
            _http = http;
            _logger = logger;
        }

        /// <summary>Requests sent to Last.fm since the server started (answers from the cache don't count).</summary>
        public int Requests { get; private set; }

        private static string CachePath => Path.Combine(
            Plugin.Instance?.DataFolderPath ?? throw new InvalidOperationException("Plugin not initialised."),
            "lastfm-cache.json");

        private static string ApiKey => Plugin.Instance?.Configuration.LastFmApiKey.Trim() ?? string.Empty;

        public static bool HasKey => ApiKey.Length > 0;

        /// <summary>Whether an answer is already kept (no request needed).</summary>
        public bool IsKept(string method, string artist) => TryKept(KeyOf(method, artist), out _);

        public Task<List<LastFmTag>> ArtistTagsAsync(string artist, CancellationToken ct) =>
            GetAsync("artist.gettoptags", artist, null, ct, json =>
                Array(json, "toptags", "tag").Select(t => new LastFmTag
                {
                    Name  = Str(t, "name"),
                    Count = (int)Num(t, "count"),
                }).Where(t => t.Name.Length > 0).Take(15).ToList());

        /// <summary>Worldwide listeners (0 when Last.fm doesn't know the artist).</summary>
        public Task<long> ArtistListenersAsync(string artist, CancellationToken ct) =>
            GetAsync("artist.getinfo", artist, null, ct, json =>
                json.TryGetProperty("artist", out var a) && a.TryGetProperty("stats", out var s) ? (long)Num(s, "listeners") : 0L);

        public Task<List<LastFmSimilar>> SimilarArtistsAsync(string artist, CancellationToken ct) =>
            GetAsync("artist.getsimilar", artist, "100", ct, json =>
                Array(json, "similarartists", "artist").Select(a => new LastFmSimilar
                {
                    Name  = Str(a, "name"),
                    Match = Num(a, "match"),
                }).Where(a => a.Name.Length > 0).ToList());

        public Task<List<LastFmTopTrack>> TopTracksAsync(string artist, CancellationToken ct) =>
            GetAsync("artist.gettoptracks", artist, "200", ct, json =>
                Array(json, "toptracks", "track").Select(t => new LastFmTopTrack
                {
                    Name      = Str(t, "name"),
                    Playcount = (long)Num(t, "playcount"),
                }).Where(t => t.Name.Length > 0).ToList());

        /// <summary>Writes new answers to disk (also done every 50 answers).</summary>
        public void Save()
        {
            lock (_lock)
            {
                if (_cache == null || _unsaved == 0) return;
                var cutoff = DateTime.UtcNow - Keep;
                var keep = _cache.Where(kv => kv.Value.At > cutoff).ToDictionary(kv => kv.Key, kv => kv.Value);
                var tmp = CachePath + ".tmp";
                File.WriteAllText(tmp, JsonSerializer.Serialize(keep));
                File.Move(tmp, CachePath, true);
                _unsaved = 0;
            }
        }

        private static string KeyOf(string method, string artist) => method + "|" + artist.Trim().ToLowerInvariant();

        private bool TryKept(string key, out JsonElement value)
        {
            lock (_lock)
            {
                Load();
                if (_cache!.TryGetValue(key, out var k) && DateTime.UtcNow - k.At < Keep)
                {
                    value = k.Value;
                    return true;
                }
            }
            value = default;
            return false;
        }

        private void Load()
        {
            if (_cache != null) return;
            try
            {
                _cache = File.Exists(CachePath)
                    ? JsonSerializer.Deserialize<Dictionary<string, Kept>>(File.ReadAllText(CachePath)) ?? new()
                    : new();
            }
            catch (Exception e)
            {
                _logger.LogWarning(e, "Rakki: Last.fm cache unreadable, starting a new one");
                _cache = new();
            }
        }

        private async Task<T> GetAsync<T>(string method, string artist, string? limit, CancellationToken ct, Func<JsonElement, T> read)
        {
            var key = KeyOf(method, artist);
            if (TryKept(key, out var kept)) return read(kept);

            JsonElement answer;
            try
            {
                answer = await FetchAsync(method, artist, limit, ct).ConfigureAwait(false);
            }
            catch (LastFmException e) when (e.Code == 6)
            {
                // Not found: kept too, as an empty answer, so it isn't asked again for 30 days.
                answer = JsonDocument.Parse("{}").RootElement.Clone();
            }

            lock (_lock)
            {
                _cache![key] = new Kept { At = DateTime.UtcNow, Value = answer };
                _unsaved++;
            }
            if (_unsaved >= 50) Save();
            return read(answer);
        }

        private async Task<JsonElement> FetchAsync(string method, string artist, string? limit, CancellationToken ct)
        {
            var apiKey = ApiKey;
            if (apiKey.Length == 0) throw new LastFmException("No Last.fm API key in the Rakki plugin settings.", 10);
            var url = $"{Api}?method={method}&artist={Uri.EscapeDataString(artist)}&autocorrect=1&format=json&api_key={Uri.EscapeDataString(apiKey)}"
                + (limit != null ? "&limit=" + limit : string.Empty);

            await _one.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                for (var attempt = 0; ; attempt++)
                {
                    var wait = _last + Gap - DateTime.UtcNow;
                    if (wait > TimeSpan.Zero) await Task.Delay(wait, ct).ConfigureAwait(false);
                    _last = DateTime.UtcNow;
                    Requests++;

                    using var client = _http.CreateClient();
                    client.Timeout = TimeSpan.FromSeconds(15);
                    string body;
                    try
                    {
                        body = await client.GetStringAsync(url, ct).ConfigureAwait(false);
                    }
                    catch (HttpRequestException e) when (attempt < 2 && e.StatusCode is null or >= System.Net.HttpStatusCode.InternalServerError
                                                                     or System.Net.HttpStatusCode.TooManyRequests)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(5 * (attempt + 1)), ct).ConfigureAwait(false);
                        continue;
                    }
                    catch (TaskCanceledException) when (!ct.IsCancellationRequested && attempt < 2)
                    {
                        continue;
                    }

                    using var doc = JsonDocument.Parse(body);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("error", out var err))
                    {
                        var code = err.ValueKind == JsonValueKind.Number ? err.GetInt32() : 0;
                        if ((code == 29 || code == 8 || code == 16) && attempt < 2)
                        {
                            await Task.Delay(TimeSpan.FromSeconds(10 * (attempt + 1)), ct).ConfigureAwait(false);
                            continue;
                        }
                        throw new LastFmException(Str(root, "message") is { Length: > 0 } m ? m : $"Last.fm error {code}", code);
                    }
                    return root.Clone();
                }
            }
            finally
            {
                _one.Release();
            }
        }

        // Last.fm sends a single object instead of a one-item array, and numbers as strings.
        private static IEnumerable<JsonElement> Array(JsonElement json, string outer, string inner)
        {
            if (!json.TryGetProperty(outer, out var o) || o.ValueKind != JsonValueKind.Object) yield break;
            if (!o.TryGetProperty(inner, out var list)) yield break;
            if (list.ValueKind == JsonValueKind.Array)
            {
                foreach (var e in list.EnumerateArray()) yield return e;
            }
            else if (list.ValueKind == JsonValueKind.Object)
            {
                yield return list;
            }
        }

        private static string Str(JsonElement e, string name) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? string.Empty : string.Empty;

        private static double Num(JsonElement e, string name)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v)) return 0;
            if (v.ValueKind == JsonValueKind.Number) return v.GetDouble();
            return v.ValueKind == JsonValueKind.String && double.TryParse(v.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : 0;
        }
    }
}
