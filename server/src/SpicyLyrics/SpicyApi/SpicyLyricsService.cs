// SpicyApi/SpicyLyricsService.cs
// ─────────────────────────────────────────────────────────────────────────────
// Glue between a Jellyfin Audio item and the Spicy Lyrics API, with a local
// cache that honours the API Terms:
//
//   <plugin data>/spicy-api/ids/<itemId>.json      Spotify ID mapping
//        Our own metadata → kept indefinitely (misses retried after 30 days).
//   <plugin data>/spicy-api/lyrics/<spotifyId>.json   API response + FetchedUtc
//        Terms §: "Anything you store must be refetched or discarded within
//        30 days." The nightly task refreshes entries after
//        SpicyRefreshAfterDays (default 25); anything that reaches 30 days
//        without a successful refetch is deleted, both by the task and on read.
//
// Local .ttml sidecars always win; this is only consulted when there is none.
// ─────────────────────────────────────────────────────────────────────────────

using System;
using System.Collections.Concurrent;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Rakki.Configuration;
using MediaBrowser.Controller.Entities.Audio;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics.SpicyApi
{
    public class SpicyLyricsService
    {
        /// <summary>Hard retention limit from the Spicy Lyrics Terms.</summary>
        public static readonly TimeSpan MaxAge = TimeSpan.FromDays(30);

        /// <summary>How long to wait before retrying a track Spotify/Spicy had nothing for.</summary>
        private static readonly TimeSpan MissRetry = TimeSpan.FromDays(30);

        private readonly SpotifyResolver   _resolver;
        private readonly SpicyLyricsClient _client;
        private readonly ILogger<SpicyLyricsService> _logger;

        // Collapse concurrent first-play fetches of the same item into one.
        private readonly ConcurrentDictionary<Guid, Lazy<Task<TTMLResponseDto?>>> _inflight = new();

        public SpicyLyricsService(
            SpotifyResolver resolver,
            SpicyLyricsClient client,
            ILogger<SpicyLyricsService> logger)
        {
            _resolver = resolver;
            _client   = client;
            _logger   = logger;
        }

        // ── Cache records ────────────────────────────────────────────────────

        public sealed class IdEntry
        {
            public string?  SpotifyId  { get; set; }
            public string   Method     { get; set; } = string.Empty;
            public DateTime CheckedUtc { get; set; }
        }

        public sealed class LyricsEntry
        {
            public DateTime FetchedUtc { get; set; }
            public bool     Found      { get; set; }
            public string?  Body       { get; set; }
        }

        public static bool IsConfigured(PluginConfiguration cfg) =>
            cfg.SpicyApiEnabled && !string.IsNullOrWhiteSpace(cfg.SpicyApiKey);

        private static string Root =>
            Path.Combine(Plugin.Instance?.DataFolderPath
                         ?? throw new InvalidOperationException("Plugin not initialised."), "spicy-api");

        public static string IdsDir    => Path.Combine(Root, "ids");
        public static string LyricsDir => Path.Combine(Root, "lyrics");

        private static string IdPath(Guid itemId)        => Path.Combine(IdsDir, itemId.ToString("N") + ".json");
        private static string LyricsPath(string spotify) => Path.Combine(LyricsDir, spotify + ".json");

        // ── Read path (no network) ───────────────────────────────────────────

        /// <summary>Cached lyrics for the item, or null. Never touches the network.</summary>
        public TTMLResponseDto? GetCached(Audio item)
        {
            var id = ReadJson<IdEntry>(IdPath(item.Id));
            if (id?.SpotifyId is null) return null;

            var entry = ReadValidLyrics(id.SpotifyId);
            if (entry is not { Found: true, Body: not null }) return null;

            try
            {
                return SpicyLyricsConverter.Convert(entry.Body);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unreadable cached Spicy Lyrics for {SpotifyId}", id.SpotifyId);
                return null;
            }
        }

        /// <summary>
        /// The cached API lyrics' Spotify ID and fetch time, without parsing them (for the lyrics
        /// search index's change check). Null when nothing usable is cached or it is 30 days old.
        /// </summary>
        public (string SpotifyId, DateTime FetchedUtc)? CacheStamp(Audio item)
        {
            var id = ReadJson<IdEntry>(IdPath(item.Id));
            if (id?.SpotifyId is null) return null;
            var path = LyricsPath(id.SpotifyId);
            if (!File.Exists(path)) return null;
            var entry = ReadJson<LyricsEntry>(path);
            if (entry is not { Found: true, Body: not null } || DateTime.UtcNow - entry.FetchedUtc >= MaxAge) return null;
            return (id.SpotifyId, entry.FetchedUtc);
        }

        /// <summary>Reads a lyrics entry, deleting it if it is past the 30-day limit.</summary>
        private LyricsEntry? ReadValidLyrics(string spotifyId)
        {
            var path  = LyricsPath(spotifyId);
            var entry = ReadJson<LyricsEntry>(path);
            if (entry is null) return null;
            if (DateTime.UtcNow - entry.FetchedUtc >= MaxAge)
            {
                TryDelete(path);
                return null;
            }
            return entry;
        }

        // ── Fetch path ───────────────────────────────────────────────────────

        /// <summary>
        /// First-play fetch: cache first, then network if allowed. Returns null
        /// on any failure so playback falls back to LRC instead of erroring.
        /// </summary>
        public async Task<TTMLResponseDto?> GetOrFetchAsync(Audio item, PluginConfiguration cfg, CancellationToken ct)
        {
            var cached = GetCached(item);
            if (cached is not null || !IsConfigured(cfg) || !cfg.SpicyFetchOnPlay) return cached;

            var lazy = _inflight.GetOrAdd(item.Id, _ => new Lazy<Task<TTMLResponseDto?>>(async () =>
            {
                try
                {
                    await EnsureAsync(item, cfg, forceRefresh: false, CancellationToken.None).ConfigureAwait(false);
                    return GetCached(item);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("Spicy Lyrics fetch failed for {Item}: {Message}", item.Name, ex.Message);
                    return null;
                }
                finally
                {
                    _inflight.TryRemove(item.Id, out Lazy<Task<TTMLResponseDto?>>? _);
                }
            }));

            // Don't let a slow API hold the request forever; the fetch keeps
            // running and the next play gets the cached result.
            var task = lazy.Value;
            var done = await Task.WhenAny(task, Task.Delay(TimeSpan.FromSeconds(20), ct)).ConfigureAwait(false);
            return done == task ? await task.ConfigureAwait(false) : null;
        }

        public enum EnsureResult { Fresh, NoSpotifyMatch, Fetched, NotFound }

        /// <summary>
        /// Makes sure the item has a Spotify mapping and a lyrics entry younger
        /// than the refresh window. Throws on configuration / transport / rate
        /// limit errors (nothing is cached for those).
        /// </summary>
        public async Task<EnsureResult> EnsureAsync(Audio item, PluginConfiguration cfg, bool forceRefresh, CancellationToken ct)
        {
            var now    = DateTime.UtcNow;
            var idPath = IdPath(item.Id);
            var id     = ReadJson<IdEntry>(idPath);

            // A "<stem>.spotify" sidecar (written by the Music Review Queue when
            // you paste a Spotify link) is authoritative: it overrides any cached
            // mapping — including a stale "miss" — so a freshly-tagged track
            // resolves on the very next play instead of waiting out the retry.
            var sidecarId = ReadSidecarId(item);
            if (sidecarId is not null && (id is null || id.SpotifyId != sidecarId))
            {
                id = new IdEntry { SpotifyId = sidecarId, Method = "sidecar", CheckedUtc = now };
                WriteJson(idPath, id);
            }
            else if (id is null || (id.SpotifyId is null && now - id.CheckedUtc >= MissRetry))
            {
                var match = await _resolver.ResolveAsync(item, cfg, ct).ConfigureAwait(false);
                id = new IdEntry { SpotifyId = match?.SpotifyId, Method = match?.Method ?? "none", CheckedUtc = now };
                WriteJson(idPath, id);
                if (match is not null)
                    _logger.LogDebug("Mapped {Item} → spotify:{Id} ({Method})", item.Name, match.Value.SpotifyId, match.Value.Method);
            }
            if (id.SpotifyId is null) return EnsureResult.NoSpotifyMatch;

            var refreshAfter = TimeSpan.FromDays(Math.Clamp(cfg.SpicyRefreshAfterDays, 1, 29));
            var existing     = ReadValidLyrics(id.SpotifyId);
            if (existing is not null && !forceRefresh && now - existing.FetchedUtc < refreshAfter)
                return EnsureResult.Fresh;

            var body = await _client.GetLyricsBodyAsync(id.SpotifyId, cfg, ct).ConfigureAwait(false);
            WriteJson(LyricsPath(id.SpotifyId), new LyricsEntry { FetchedUtc = now, Found = body is not null, Body = body });
            return body is null ? EnsureResult.NotFound : EnsureResult.Fetched;
        }

        /// <summary>Whether this item's lyrics entry is due for a refetch.</summary>
        public static bool NeedsWork(Audio item, PluginConfiguration cfg, out DateTime? fetchedUtc)
        {
            fetchedUtc = null;
            var id = ReadJson<IdEntry>(IdPath(item.Id));
            // A new/changed .spotify sidecar always needs picking up, even over a
            // cached miss.
            var sidecarId = ReadSidecarId(item);
            if (sidecarId is not null && id?.SpotifyId != sidecarId) return true;
            if (id is null) return true;
            if (id.SpotifyId is null) return DateTime.UtcNow - id.CheckedUtc >= MissRetry;

            var entry = ReadJson<LyricsEntry>(LyricsPath(id.SpotifyId));
            if (entry is null) return true;
            fetchedUtc = entry.FetchedUtc;
            var refreshAfter = TimeSpan.FromDays(Math.Clamp(cfg.SpicyRefreshAfterDays, 1, 29));
            return DateTime.UtcNow - entry.FetchedUtc >= refreshAfter;
        }

        /// <summary>Deletes every cached lyrics file at or past the 30-day limit.</summary>
        public int PurgeExpired()
        {
            if (!Directory.Exists(LyricsDir)) return 0;
            int removed = 0;
            foreach (var file in Directory.EnumerateFiles(LyricsDir, "*.json"))
            {
                var entry = ReadJson<LyricsEntry>(file);
                if (entry is null || DateTime.UtcNow - entry.FetchedUtc >= MaxAge)
                {
                    TryDelete(file);
                    removed++;
                }
            }
            return removed;
        }

        /// <summary>
        /// The Spotify track ID from a "&lt;stem&gt;.spotify" sidecar next to the
        /// audio file (written by the Music Review Queue), or null if there is
        /// none / it is malformed.
        /// </summary>
        private static string? ReadSidecarId(Audio item)
        {
            var path = item.Path;
            if (string.IsNullOrEmpty(path)) return null;
            var sidecar = Path.ChangeExtension(path, ".spotify");
            try
            {
                if (!File.Exists(sidecar)) return null;
                var raw = File.ReadAllText(sidecar).Trim();
                return SpotifyResolver.IsSpotifyId(raw) ? raw : null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        // ── File helpers ─────────────────────────────────────────────────────

        private static T? ReadJson<T>(string path) where T : class
        {
            try
            {
                return File.Exists(path) ? JsonSerializer.Deserialize<T>(File.ReadAllText(path)) : null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static void WriteJson<T>(string path, T value)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(value));
            File.Move(tmp, path, overwrite: true);
        }

        private static void TryDelete(string path)
        {
            try { File.Delete(path); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }
}
