// GET /Rakki/DailyMix/Preview: tonight's Daily Mixes as they would be built, with the reasons
// (leads and their chances, tag groups, each mix's neighbours and pools), without writing
// anything. Administrators only. The first call starts a build; call again to see its
// progress, then the result. ?refresh=true builds again; ?date=yyyy-MM-dd previews another day
// (the draw is seeded by the date); ?userId= previews for another user.

using System;
using System.Globalization;
using System.Linq;
using System.Net.Mime;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Rakki.DailyMix
{
    [ApiController]
    [Route("Rakki/DailyMix")]
    [Authorize(Policy = "RequiresElevation")]
    [Produces(MediaTypeNames.Application.Json)]
    public class DailyMixController : ControllerBase
    {
        private readonly MixService _mixes;

        public DailyMixController(MixService mixes) => _mixes = mixes;

        [HttpGet("Preview")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public ActionResult<MixStatus> Preview(
            [FromQuery] Guid? userId,
            [FromQuery] string? date,
            [FromQuery] bool refresh = false)
        {
            var user = userId
                ?? (Guid.TryParse(Plugin.Instance?.Configuration.MixUserId, out var configured) ? configured : (Guid?)null)
                ?? (Guid.TryParse(User.Claims.FirstOrDefault(c => c.Type == "Jellyfin-UserId")?.Value, out var caller) ? caller : (Guid?)null);
            if (user is not Guid u || u == Guid.Empty) return BadRequest("No user: pass userId or set one in the plugin settings.");

            // Tonight's build is for tomorrow (it runs at 12 AM), so that's the default.
            var day = DateOnly.FromDateTime(DateTime.Now).AddDays(1);
            if (!string.IsNullOrEmpty(date) && !DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day))
            {
                return BadRequest("date must be yyyy-MM-dd.");
            }
            return _mixes.Preview(u, day, refresh);
        }
    }
}
