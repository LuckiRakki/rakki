// POST /Rakki/Playlists/Sync: keeps Rakki's playlist cache (src/library/playlistCache.ts) in
// step in one request. The app sends the stamp it has for each playlist; the answer lists every
// playlist the user has (so deleted ones can go) with its current stamp, and the songs of each
// one whose stamp changed. Without the plugin the app asks for the playlist list and then each
// changed playlist separately.
//
// A stamp is the playlist's entry count and Jellyfin's Etag (which changes whenever the
// playlist is saved). Songs come as [song id, entry id] (an entry is one place in the list).

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Mime;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Playlists;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Rakki.Playlists
{
    public sealed class PlaylistSyncRequest
    {
        /// <summary>Playlist id → the stamp the app has ("" to always get its songs).</summary>
        public Dictionary<string, string> Known { get; set; } = new();
    }

    public sealed class PlaylistStamp
    {
        public string Id    { get; set; } = string.Empty;
        public string Stamp { get; set; } = string.Empty;
    }

    public sealed class PlaylistSongs
    {
        public string     Id    { get; set; } = string.Empty;
        public string     Stamp { get; set; } = string.Empty;
        public string[][] Pairs { get; set; } = Array.Empty<string[]>();
    }

    public sealed class PlaylistSyncResponse
    {
        public List<PlaylistStamp> Playlists { get; set; } = new();
        public List<PlaylistSongs> Changed   { get; set; } = new();
    }

    [ApiController]
    [Route("Rakki/Playlists")]
    [Authorize]
    [Produces(MediaTypeNames.Application.Json)]
    public class PlaylistSyncController : ControllerBase
    {
        private readonly ILibraryManager _library;
        private readonly IUserManager _users;

        public PlaylistSyncController(ILibraryManager library, IUserManager users)
        {
            _library = library;
            _users = users;
        }

        [HttpPost("Sync")]
        public ActionResult<PlaylistSyncResponse> Sync([FromBody] PlaylistSyncRequest body)
        {
            if (!Guid.TryParse(User.Claims.FirstOrDefault(c => c.Type == "Jellyfin-UserId")?.Value, out var userId)) return Unauthorized();
            var user = _users.GetUserById(userId);
            if (user == null) return Unauthorized();

            var playlists = _library.GetItemList(new InternalItemsQuery(user)
            {
                IncludeItemTypes = new[] { BaseItemKind.Playlist },
                Recursive        = true,
            }).OfType<Playlist>()
              // Daily Mixes aren't the user's own playlists (the app keeps them out of these places).
              .Where(p => p.Name?.StartsWith("[Rakki] ", StringComparison.Ordinal) != true);

            var answer = new PlaylistSyncResponse();
            foreach (var p in playlists)
            {
                var id = p.Id.ToString("N");
                var stamp = $"{p.LinkedChildren.Length}|{p.GetEtag(user)}";
                answer.Playlists.Add(new PlaylistStamp { Id = id, Stamp = stamp });
                if (body.Known.TryGetValue(id, out var known) && known == stamp) continue;
                answer.Changed.Add(new PlaylistSongs
                {
                    Id = id,
                    Stamp = stamp,
                    Pairs = p.GetManageableItems()
                        .Where(x => x.Item2.IsVisible(user))
                        .Select(x => new[] { x.Item2.Id.ToString("N"), x.Item1.ItemId?.ToString("N") ?? string.Empty })
                        .ToArray(),
                });
            }
            return answer;
        }
    }
}
