// SpicyLyricsController.cs
// ─────────────────────────────────────────────────────────────────────────────
// Custom REST endpoint:  GET  /SpicyLyrics/{itemId}/ttml
//
// Returns full word-level TTML data so the frontend can drive word-by-word
// animation.  This supplements the standard /Audio/{itemId}/Lyrics endpoint
// which, in Jellyfin 10.10.x, does not carry per-word cues.
// ─────────────────────────────────────────────────────────────────────────────

using System;
using System.Net.Mime;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Rakki.SpicyLyrics;
using Jellyfin.Plugin.Rakki.Configuration;
using Jellyfin.Plugin.Rakki.SpicyLyrics.LyricsSearch;
using Jellyfin.Plugin.Rakki.SpicyLyrics.SpicyApi;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics.Api
{
    /// <summary>
    /// Provides word-level lyric data parsed from TTML sidecar files.
    /// The frontend adapter (JellyfinAdapter.ts) calls this before falling back
    /// to the standard /Audio/{itemId}/Lyrics endpoint.
    /// </summary>
    [ApiController]
    [Route("SpicyLyrics")]
    [Authorize]             // require a valid Jellyfin session token
    [Produces(MediaTypeNames.Application.Json)]
    public class SpicyLyricsController : ControllerBase
    {
        private readonly ILibraryManager        _library;
        private readonly TTMLLyricProvider      _ttmlProvider;
        private readonly SpicyLyricsService     _spicy;
        private readonly LyricsIndex            _index;
        private readonly ILogger<SpicyLyricsController> _logger;

        public SpicyLyricsController(
            ILibraryManager              library,
            TTMLLyricProvider            ttmlProvider,
            SpicyLyricsService           spicy,
            LyricsIndex                  index,
            ILogger<SpicyLyricsController> logger)
        {
            _library      = library;
            _ttmlProvider = ttmlProvider;
            _spicy        = spicy;
            _index        = index;
            _logger       = logger;
        }

        // ── GET /SpicyLyrics/Search?query=… ───────────────────────────────────

        /// <summary>
        /// Songs whose lyrics contain the words typed (best matches first), each with the
        /// matching line. Ready=false while the index is still being built after a restart.
        /// </summary>
        [HttpGet("Search")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<ActionResult<object>> SearchLyrics(
            [FromQuery] string query,
            [FromQuery] int limit = 20,
            CancellationToken ct = default)
        {
            _index.EnsureLoaded();
            if (!_index.IsReady)
            {
                // First search after a restart: build now, but don't keep the app waiting long.
                var build = _index.BuildAsync(null, CancellationToken.None);
                await Task.WhenAny(build, Task.Delay(TimeSpan.FromSeconds(4), ct)).ConfigureAwait(false);
                if (!_index.IsReady) return Ok(new { Ready = false, Items = Array.Empty<LyricsSearchHit>() });
            }
            return Ok(new { Ready = true, Items = _index.Search(query ?? string.Empty, Math.Clamp(limit, 1, 50)) });
        }

        // ── POST /SpicyLyrics/{itemId}/offset?offsetMs=… ─────────────────────

        /// <summary>
        /// Moves the song's .ttml sidecar timings by offsetMs (positive = later), for the whole
        /// song at once. The original is kept as .orig the first time.
        /// </summary>
        [HttpPost("{itemId}/offset")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public ActionResult<object> OffsetSidecar([FromRoute] Guid itemId, [FromQuery] int offsetMs)
        {
            if (_library.GetItemById(itemId) is not Audio audioItem) return NotFound("Item not found or is not an audio track.");
            var path = Sidecars.FindTtml(audioItem);
            if (path is null) return NotFound("This song has no .ttml sidecar.");
            if (offsetMs == 0) return Ok(new { Changed = 0 });
            try
            {
                var changed = Sidecars.ShiftTtml(path, offsetMs);
                _logger.LogInformation("Spicy Lyrics: moved {Path} by {Offset} ms ({Count} times).", path, offsetMs, changed);
                return Ok(new { Changed = changed });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Couldn't offset {Path}", path);
                return StatusCode(StatusCodes.Status500InternalServerError, "Couldn't write the sidecar.");
            }
        }

        // ── GET /SpicyLyrics/{itemId}/ttml ────────────────────────────────────

        /// <summary>
        /// Returns word-level TTML lyric data for a given audio item.
        /// </summary>
        /// <param name="itemId">The Jellyfin item Id (Guid).</param>
        /// <response code="200">Lyrics found and parsed successfully.</response>
        /// <response code="404">No TTML file found for this item.</response>
        [HttpGet("{itemId}/ttml")]
        [ProducesResponseType(StatusCodes.Status200OK,  Type = typeof(TTMLResponseDto))]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<TTMLResponseDto>> GetTTMLLyrics(
            [FromRoute] Guid itemId,
            CancellationToken ct)
        {
            // Resolve the library item
            var item = _library.GetItemById(itemId);
            if (item is not Audio audioItem)
            {
                return NotFound("Item not found or is not an audio track.");
            }

            var cfg      = Plugin.Instance?.Configuration ?? new PluginConfiguration();
            var ttmlPath = Sidecars.FindTtml(audioItem);

            // Spicy Lyrics API. When SpicyApiPriority is on it is tried first and
            // the local sidecar is the fallback; otherwise it only fills gaps for
            // tracks that have no sidecar. Either way, a track we can't map to a
            // Spotify ID (or that the API has no lyrics for) falls back to local.
            if (SpicyLyricsService.IsConfigured(cfg) && (cfg.SpicyApiPriority || ttmlPath is null))
            {
                var spicy = await _spicy.GetOrFetchAsync(audioItem, cfg, ct).ConfigureAwait(false);
                var usable = spicy is not null && spicy.Lines.Count > 0;
                // Anti-downgrade: never replace a sidecar with UNSYNCED API text.
                // Take the API when it's synced/word-level, or when there is no
                // sidecar to fall back to.
                var synced = usable && (spicy!.IsSynced || spicy.Lines.Exists(l => l.Words.Count > 0));
                if (usable && (synced || ttmlPath is null)) return Ok(spicy);
            }

            if (ttmlPath is not null)
            {
                try
                {
                    var dto = _ttmlProvider.ParseTTMLFile(ttmlPath);
                    return Ok(dto);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error parsing TTML file: {Path}", ttmlPath);
                    return StatusCode(StatusCodes.Status500InternalServerError,
                        "Failed to parse TTML file.");
                }
            }

            return NotFound("No lyrics found for this item.");
        }

        // ── GET /SpicyLyrics/{itemId}/hasLyrics  (lightweight probe) ──────────

        /// <summary>
        /// Returns whether a TTML file exists for the given item — useful for
        /// the frontend to decide whether to show the word-level toggle.
        /// </summary>
        [HttpGet("{itemId}/hasLyrics")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public ActionResult<object> HasTTMLLyrics([FromRoute] Guid itemId)
        {
            var item = _library.GetItemById(itemId);
            if (item is not Audio audioItem)
                return Ok(new { HasTTML = false });

            return Ok(new
            {
                HasTTML = Sidecars.FindTtml(audioItem) is not null || _spicy.GetCached(audioItem) is not null,
            });
        }
    }
}
