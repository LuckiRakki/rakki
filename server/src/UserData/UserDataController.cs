// What a Rakki app keeps on the server for its user, so every Rakki (phone, desktop) has it:
// your radio stations now, other preferences later. One small JSON document per name, per user.
// - GET /Rakki/User/Data/{name}: the document, or 404 when there's none yet.
// - PUT /Rakki/User/Data/{name}: replaces it (JSON body, at most 256 KB).
// Stored under the server's data folder (rakki/users/<user id>/<name>.json); only the signed-in
// user's own documents are ever read or written.

using System;
using System.IO;
using System.Linq;
using System.Net.Mime;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Rakki.UserData
{
    [ApiController]
    [Route("Rakki/User/Data")]
    [Authorize]
    public class UserDataController : ControllerBase
    {
        private const int MaxBytes = 256 * 1024;
        private static readonly Regex Name = new("^[a-z0-9-]{1,40}$", RegexOptions.Compiled);
        private static readonly SemaphoreSlim Gate = new(1, 1);
        private readonly IApplicationPaths _paths;

        public UserDataController(IApplicationPaths paths) => _paths = paths;

        private string? PathFor(string name)
        {
            if (!Name.IsMatch(name)) return null;
            if (!Guid.TryParse(User.Claims.FirstOrDefault(c => c.Type == "Jellyfin-UserId")?.Value, out var userId)) return null;
            return Path.Combine(_paths.DataPath, "rakki", "users", userId.ToString("N"), name + ".json");
        }

        [HttpGet("{name}")]
        [Produces(MediaTypeNames.Application.Json)]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult> Get([FromRoute] string name, CancellationToken ct)
        {
            var path = PathFor(name);
            if (path == null) return BadRequest();
            if (!System.IO.File.Exists(path)) return NotFound();
            var json = await System.IO.File.ReadAllTextAsync(path, ct).ConfigureAwait(false);
            return Content(json, MediaTypeNames.Application.Json, Encoding.UTF8);
        }

        [HttpPut("{name}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult> Put([FromRoute] string name, CancellationToken ct)
        {
            var path = PathFor(name);
            if (path == null) return BadRequest();
            using var reader = new StreamReader(Request.Body, Encoding.UTF8);
            var body = await reader.ReadToEndAsync(ct).ConfigureAwait(false);
            if (body.Length == 0 || Encoding.UTF8.GetByteCount(body) > MaxBytes) return BadRequest("Empty or too big.");
            try
            {
                using var _ = JsonDocument.Parse(body);
            }
            catch (JsonException)
            {
                return BadRequest("Not JSON.");
            }
            await Gate.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                // Written whole, then swapped in, so a reader never sees half a document.
                var tmp = path + ".tmp";
                await System.IO.File.WriteAllTextAsync(tmp, body, ct).ConfigureAwait(false);
                System.IO.File.Move(tmp, path, true);
            }
            finally
            {
                Gate.Release();
            }
            return NoContent();
        }
    }
}
