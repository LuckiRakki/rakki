// What the Rakki app asks the plugin directly:
// - GET  /Rakki/Info: the plugin is installed (its version) and whether it has a Last.fm key.
// - GET  /Rakki/LastFm/Key and POST /Rakki/LastFm/Key: the Last.fm key, shared between the
//   server and the phone so it's only entered once (whichever side has it fills in the
//   other). Administrators only; a new key is checked with Last.fm before it's saved.

using System;
using System.Net.Mime;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Rakki.LastFm;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Rakki
{
    public sealed class LastFmKeyBody
    {
        public string Key { get; set; } = string.Empty;
    }

    [ApiController]
    [Route("Rakki")]
    [Authorize]
    [Produces(MediaTypeNames.Application.Json)]
    public class RakkiController : ControllerBase
    {
        private readonly LastFmClient _lastFm;

        public RakkiController(LastFmClient lastFm) => _lastFm = lastFm;

        [HttpGet("Info")]
        public ActionResult<object> Info() => new
        {
            Version       = Plugin.Instance?.Version.ToString() ?? string.Empty,
            LastFmKeySet  = LastFmClient.HasKey,
        };

        [HttpGet("LastFm/Key")]
        [Authorize(Policy = "RequiresElevation")]
        public ActionResult<LastFmKeyBody> GetLastFmKey() =>
            new LastFmKeyBody { Key = Plugin.Instance?.Configuration.LastFmApiKey.Trim() ?? string.Empty };

        [HttpPost("LastFm/Key")]
        [Authorize(Policy = "RequiresElevation")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult> SetLastFmKey([FromBody] LastFmKeyBody body, CancellationToken ct)
        {
            var plugin = Plugin.Instance;
            var key = body.Key?.Trim() ?? string.Empty;
            if (plugin == null || key.Length == 0) return BadRequest("No key.");
            if (key == plugin.Configuration.LastFmApiKey.Trim()) return NoContent();
            try
            {
                await _lastFm.CheckKeyAsync(key, ct).ConfigureAwait(false);
            }
            catch (LastFmException e)
            {
                return BadRequest(e.Message);
            }
            plugin.Configuration.LastFmApiKey = key;
            plugin.SaveConfiguration();
            return NoContent();
        }
    }
}
