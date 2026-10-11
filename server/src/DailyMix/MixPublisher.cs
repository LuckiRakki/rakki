// Writes a day's Daily Mixes to the server as playlists named "[Rakki] Daily Mix 1" to "6",
// owned by the user. Each is created once and then updated in place (its songs replaced), so
// its id, and anything that points at it, stays the same. The overview says why the mix is what
// it is. The day goes into the history (leads for the 3-day rule, songs for "not too much of
// yesterday"). Covers come later, once the design is approved.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Playlists;
using MediaBrowser.Model.Playlists;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.DailyMix
{
    public class MixPublisher
    {
        public const string Prefix = "[Rakki] Daily Mix ";

        private readonly IPlaylistManager _playlists;
        private readonly ILibraryManager _library;
        private readonly ILogger<MixPublisher> _logger;

        public MixPublisher(IPlaylistManager playlists, ILibraryManager library, ILogger<MixPublisher> logger)
        {
            _playlists = playlists;
            _library = library;
            _logger = logger;
        }

        public async Task PublishAsync(MixPreview preview, CancellationToken ct)
        {
            var user = preview.UserId;
            var existing = _playlists.GetPlaylists(user)
                .Where(p => p.Name != null && p.Name.StartsWith(Prefix, StringComparison.Ordinal))
                .GroupBy(p => p.Name!)
                .ToDictionary(g => g.Key, g => g.OrderBy(p => p.DateCreated).First(), StringComparer.Ordinal);

            foreach (var mix in preview.Mixes)
            {
                ct.ThrowIfCancellationRequested();
                var name = Prefix + mix.Number;
                var ids = mix.Tracks.Select(t => t.Id).ToList();
                Guid id;
                if (existing.TryGetValue(name, out var playlist))
                {
                    id = playlist.Id;
                    await _playlists.UpdatePlaylist(new PlaylistUpdateRequest { Id = id, UserId = user, Ids = ids }).ConfigureAwait(false);
                }
                else
                {
                    var created = await _playlists.CreatePlaylist(new PlaylistCreationRequest
                    {
                        Name       = name,
                        UserId     = user,
                        ItemIdList = ids,
                        MediaType  = MediaType.Audio,
                        Public     = false,
                    }).ConfigureAwait(false);
                    id = Guid.Parse(created.Id);
                }

                if (_library.GetItemById(id) is BaseItem item)
                {
                    var artists = mix.Neighbours.Keys.Where(a => a != mix.Lead).Take(2).ToList();
                    item.Overview = $"{mix.Lead}{(artists.Count > 0 ? ", " + string.Join(", ", artists) : string.Empty)} and more. "
                        + $"Daily Mix for {preview.Date}. {mix.Why}";
                    await item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit, ct).ConfigureAwait(false);
                }
            }

            // Mixes beyond today's count (fewer leads than mixes) are emptied, not left stale.
            foreach (var (name, playlist) in existing)
            {
                if (int.TryParse(name[Prefix.Length..], out var n) && n > preview.Mixes.Count)
                {
                    await _playlists.UpdatePlaylist(new PlaylistUpdateRequest { Id = playlist.Id, UserId = user, Ids = Array.Empty<Guid>() }).ConfigureAwait(false);
                }
            }

            var history = MixHistory.Load(user);
            history.Days.RemoveAll(d => d.Date == preview.Date);
            history.Days.Add(new MixHistory.Day
            {
                Date      = preview.Date,
                Published = true,
                Leads     = preview.Mixes.Select(m => Library.NameKey(m.Lead)).ToList(),
                Songs     = preview.Mixes.SelectMany(m => m.Tracks.Select(t => t.Id)).Distinct().ToList(),
            });
            history.Save(user);
            _logger.LogInformation("Rakki: published {Count} Daily Mixes for {Date}", preview.Mixes.Count, preview.Date);
        }
    }
}
