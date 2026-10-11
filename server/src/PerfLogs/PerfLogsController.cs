// The performance logs Rakki uploads (Settings → Performance log), which Jellyfin keeps in its
// log folder as upload_Rakki_<version>_<time>.log, readable from the plugin's settings page.
// Administrators only.
// - GET /Rakki/PerfLogs: the logs, newest first.
// - GET /Rakki/PerfLogs/{name}: one log as text.

using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using MediaBrowser.Common.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Rakki.PerfLogs
{
    [ApiController]
    [Route("Rakki/PerfLogs")]
    [Authorize(Policy = "RequiresElevation")]
    public class PerfLogsController : ControllerBase
    {
        private static readonly Regex Name = new(@"^upload_Rakki_[A-Za-z0-9._-]+\.log$", RegexOptions.Compiled);

        private readonly IApplicationPaths _paths;

        public PerfLogsController(IApplicationPaths paths) => _paths = paths;

        [HttpGet]
        public ActionResult<object> List() =>
            Ok(new DirectoryInfo(_paths.LogDirectoryPath).EnumerateFiles("upload_Rakki_*.log")
                .Where(f => Name.IsMatch(f.Name))
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .Take(100)
                .Select(f => new { f.Name, Size = f.Length, Date = f.LastWriteTimeUtc }));

        [HttpGet("{name}")]
        [Produces("text/plain")]
        public ActionResult Get([FromRoute] string name)
        {
            if (!Name.IsMatch(name)) return BadRequest();
            var path = Path.Combine(_paths.LogDirectoryPath, name);
            return System.IO.File.Exists(path) ? PhysicalFile(path, "text/plain; charset=utf-8") : NotFound();
        }
    }
}
