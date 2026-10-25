// Audio edits and lyrics made in Rakki (SongEdits.cs), for every signed-in user. Song-wide, like
// lyrics: everyone on the server hears a song's edit and sees its lyrics.
// - GET /Rakki/Edits: every edit, { "<item id>": { ... } }.
// - GET /Rakki/Edits/{id}: one, or 404. PUT (JSON object, at most 16 KB) sets it, DELETE removes it.
// - PUT /Rakki/Lyrics/{id}: lyrics made in Rakki (TTML, at most 1 MB). DELETE removes them.
// - GET /Rakki/Lyrics/{id}/Made: whether the song has some, and who made them.

using System;
using System.IO;
using System.Linq;
using System.Net.Mime;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using Jellyfin.Plugin.Rakki.SpicyLyrics;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.Edits
{
    [ApiController]
    [Route("Rakki")]
    [Authorize]
    public class SongEditsController : ControllerBase
    {
        private const int MaxEditBytes = 16 * 1024;
        private const int MaxLyricsBytes = 1024 * 1024;
        private readonly SongEdits _edits;
        private readonly ILibraryManager _library;
        private readonly TTMLLyricProvider _ttml;
        private readonly ILogger<SongEditsController> _logger;

        public SongEditsController(SongEdits edits, ILibraryManager library, TTMLLyricProvider ttml, ILogger<SongEditsController> logger)
        {
            _edits = edits;
            _library = library;
            _ttml = ttml;
            _logger = logger;
        }

        private bool IsSong(Guid id) => _library.GetItemById(id) is Audio;

        private async Task<string?> BodyAsync(int max, CancellationToken ct)
        {
            using var reader = new StreamReader(Request.Body, Encoding.UTF8);
            var body = await reader.ReadToEndAsync(ct).ConfigureAwait(false);
            return body.Length == 0 || Encoding.UTF8.GetByteCount(body) > max ? null : body;
        }

        // ── Audio edits ──────────────────────────────────────────────────────

        [HttpGet("Edits")]
        [Produces(MediaTypeNames.Application.Json)]
        public async Task<ActionResult> All(CancellationToken ct)
            => Content(await _edits.AllJsonAsync(ct).ConfigureAwait(false), MediaTypeNames.Application.Json, Encoding.UTF8);

        [HttpGet("Edits/{itemId}")]
        [Produces(MediaTypeNames.Application.Json)]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult> Get([FromRoute] Guid itemId, CancellationToken ct)
        {
            var json = await _edits.GetJsonAsync(itemId, ct).ConfigureAwait(false);
            return json is null ? NotFound() : Content(json, MediaTypeNames.Application.Json, Encoding.UTF8);
        }

        [HttpPut("Edits/{itemId}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult> Put([FromRoute] Guid itemId, CancellationToken ct)
        {
            if (!IsSong(itemId)) return NotFound("Not a song.");
            var body = await BodyAsync(MaxEditBytes, ct).ConfigureAwait(false);
            if (body is null) return BadRequest("Empty or too big.");
            JsonObject? edit;
            try
            {
                edit = JsonNode.Parse(body) as JsonObject;
            }
            catch (JsonException)
            {
                edit = null;
            }
            if (edit is null) return BadRequest("Not a JSON object.");
            await _edits.SetAsync(itemId, edit, ct).ConfigureAwait(false);
            return NoContent();
        }

        [HttpDelete("Edits/{itemId}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        public async Task<ActionResult> Delete([FromRoute] Guid itemId, CancellationToken ct)
        {
            await _edits.SetAsync(itemId, null, ct).ConfigureAwait(false);
            return NoContent();
        }

        // ── Lyrics made in Rakki ─────────────────────────────────────────────

        [HttpPut("Lyrics/{itemId}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult> PutLyrics([FromRoute] Guid itemId, CancellationToken ct)
        {
            if (!IsSong(itemId)) return NotFound("Not a song.");
            var body = await BodyAsync(MaxLyricsBytes, ct).ConfigureAwait(false);
            if (body is null) return BadRequest("Empty or too big.");
            try
            {
                var doc = new XmlDocument { XmlResolver = null };
                using (var reader = XmlReader.Create(new StringReader(body), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null }))
                {
                    doc.Load(reader);
                }
                if (doc.DocumentElement?.LocalName != "tt") return BadRequest("Not TTML.");
            }
            catch (XmlException)
            {
                return BadRequest("Not TTML.");
            }
            var by = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.Name)?.Value
                     ?? User.Identity?.Name ?? string.Empty;
            await _edits.SaveMadeLyricsAsync(itemId, body, by, ct).ConfigureAwait(false);
            // Check it reads back as lyrics before anyone is shown it.
            var path = _edits.MadeLyricsPath(itemId);
            if (path is not null && _ttml.ParseTTMLFile(path).Lines.Count == 0)
            {
                _edits.RemoveMadeLyrics(itemId);
                return BadRequest("No lines in it.");
            }
            _logger.LogInformation("Rakki: lyrics made in Rakki saved for {Id} by {By}.", itemId, by);
            return NoContent();
        }

        [HttpDelete("Lyrics/{itemId}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        public ActionResult DeleteLyrics([FromRoute] Guid itemId)
        {
            _edits.RemoveMadeLyrics(itemId);
            return NoContent();
        }

        [HttpGet("Lyrics/{itemId}/Made")]
        [Produces(MediaTypeNames.Application.Json)]
        public ActionResult<object> Made([FromRoute] Guid itemId)
        {
            var info = _edits.MadeLyricsPath(itemId) is null ? null : _edits.MadeLyricsInfo(itemId);
            return new { Made = _edits.MadeLyricsPath(itemId) is not null, By = info?.By ?? string.Empty, Saved = info?.Saved };
        }
    }
}
