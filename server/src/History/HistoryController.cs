// History and Stats for the Rakki apps (2.0), from the plays HistoryTracker keeps:
// - GET /Rakki/History?limit=50&before=<ISO time>: your plays, newest first, with each song's name,
//   artist and album, the device and the app.
// - GET /Rakki/Stats?days=7&tz=-300: plays, minutes, songs and artists in the last `days` days
//   (0 = all time), minutes per day (in your time zone, `tz` minutes from UTC), and your top
//   artists, albums and songs.
// Only the signed-in user's own plays are ever read.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Mime;
using Jellyfin.Plugin.Rakki.History;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Rakki.HistoryApi
{
    public sealed class HistoryEntry
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Artist { get; set; } = string.Empty;
        public string Album { get; set; } = string.Empty;
        public Guid? AlbumId { get; set; }
        public DateTime At { get; set; }
        public int Seconds { get; set; }
        public string Device { get; set; } = string.Empty;
        public string App { get; set; } = string.Empty;
    }

    public sealed class TopEntry
    {
        public Guid? Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Artist { get; set; } = string.Empty;
        public int Plays { get; set; }
        public int Minutes { get; set; }
    }

    public sealed class DayEntry
    {
        public string Date { get; set; } = string.Empty;
        public int Minutes { get; set; }
    }

    public sealed class StatsResult
    {
        public int Days { get; set; }
        public int Plays { get; set; }
        public int Minutes { get; set; }
        public int Songs { get; set; }
        public int Artists { get; set; }
        public DateTime? Since { get; set; }
        public List<DayEntry> PerDay { get; set; } = new();
        public List<TopEntry> TopArtists { get; set; } = new();
        public List<TopEntry> TopAlbums { get; set; } = new();
        public List<TopEntry> TopSongs { get; set; } = new();
    }

    [ApiController]
    [Route("Rakki")]
    [Authorize]
    [Produces(MediaTypeNames.Application.Json)]
    public class HistoryController : ControllerBase
    {
        private readonly HistoryTracker _history;
        private readonly ILibraryManager _library;

        public HistoryController(HistoryTracker history, ILibraryManager library)
        {
            _history = history;
            _library = library;
        }

        private Guid? Caller() =>
            Guid.TryParse(User.Claims.FirstOrDefault(c => c.Type == "Jellyfin-UserId")?.Value, out var id) ? id : null;

        private static string ArtistOf(Audio song) =>
            song.AlbumArtists?.FirstOrDefault() ?? song.Artists?.FirstOrDefault() ?? string.Empty;

        [HttpGet("History")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public ActionResult<List<HistoryEntry>> History([FromQuery] int limit = 50, [FromQuery] DateTime? before = null)
        {
            if (Caller() is not Guid user) return Unauthorized();
            limit = Math.Clamp(limit, 1, 200);
            var cutoff = before?.ToUniversalTime();
            var plays = _history.For(user);
            var page = new List<HistoryEntry>(limit);
            for (var i = plays.Count - 1; i >= 0 && page.Count < limit; i--)
            {
                var p = plays[i];
                if (cutoff is DateTime c && p.At >= c) continue;
                if (_library.GetItemById(p.Id) is not Audio song) continue;
                page.Add(new HistoryEntry
                {
                    Id = p.Id,
                    Name = song.Name ?? string.Empty,
                    Artist = ArtistOf(song),
                    Album = song.Album ?? string.Empty,
                    AlbumId = song.AlbumEntity?.Id,
                    At = DateTime.SpecifyKind(p.At, DateTimeKind.Utc),
                    Seconds = p.Sec,
                    Device = p.Dev,
                    App = p.App,
                });
            }
            return page;
        }

        [HttpGet("Stats")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public ActionResult<StatsResult> Stats([FromQuery] int days = 7, [FromQuery] int tz = 0)
        {
            if (Caller() is not Guid user) return Unauthorized();
            days = Math.Clamp(days, 0, 3650);
            var offset = TimeSpan.FromMinutes(Math.Clamp(tz, -14 * 60, 14 * 60));
            var now = DateTime.UtcNow;
            var from = days == 0 ? DateTime.MinValue : (now + offset).Date.AddDays(1 - days) - offset;
            var plays = _history.For(user).Where(p => p.At >= from).ToList();

            var songs = new Dictionary<Guid, Audio?>();
            Audio? Song(Guid id)
            {
                if (!songs.TryGetValue(id, out var s)) songs[id] = s = _library.GetItemById(id) as Audio;
                return s;
            }

            var result = new StatsResult
            {
                Days = days,
                Plays = plays.Count,
                Minutes = (int)Math.Round(plays.Sum(p => p.Sec) / 60.0),
                Songs = plays.Select(p => p.Id).Distinct().Count(),
                Since = plays.Count > 0 ? DateTime.SpecifyKind(plays[0].At, DateTimeKind.Utc) : null,
            };

            // Minutes per day, every day in the range (all time: from the first play), in the caller's time zone.
            var perDay = plays.GroupBy(p => (p.At + offset).Date).ToDictionary(g => g.Key, g => g.Sum(p => p.Sec));
            if (plays.Count > 0)
            {
                var first = days == 0 ? (plays[0].At + offset).Date : (from + offset).Date;
                var last = (now + offset).Date;
                if ((last - first).TotalDays > 400) first = last.AddDays(-400);
                for (var d = first; d <= last; d = d.AddDays(1))
                {
                    result.PerDay.Add(new DayEntry { Date = d.ToString("yyyy-MM-dd"), Minutes = (int)Math.Round(perDay.GetValueOrDefault(d) / 60.0) });
                }
            }

            var withSong = plays.Select(p => (Play: p, Song: Song(p.Id))).Where(x => x.Song != null).ToList();
            result.Artists = withSong.Select(x => ArtistOf(x.Song!)).Where(a => a.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Count();

            result.TopArtists = withSong
                .GroupBy(x => ArtistOf(x.Song!), StringComparer.OrdinalIgnoreCase)
                .Where(g => g.Key.Length > 0)
                .Select(g => new TopEntry { Name = g.First().Song!.AlbumArtists?.FirstOrDefault() ?? g.Key, Plays = g.Count(), Minutes = (int)Math.Round(g.Sum(x => x.Play.Sec) / 60.0) })
                .OrderByDescending(t => t.Plays).ThenByDescending(t => t.Minutes).Take(10).ToList();
            foreach (var a in result.TopArtists)
            {
                try
                {
                    a.Id = _library.GetArtist(a.Name)?.Id;
                }
                catch
                {
                    // An artist Jellyfin doesn't know as an item: no link, the name still shows.
                }
            }

            result.TopAlbums = withSong
                .Where(x => x.Song!.AlbumEntity != null)
                .GroupBy(x => x.Song!.AlbumEntity!.Id)
                .Select(g => new TopEntry { Id = g.Key, Name = g.First().Song!.Album ?? string.Empty, Artist = ArtistOf(g.First().Song!), Plays = g.Count(), Minutes = (int)Math.Round(g.Sum(x => x.Play.Sec) / 60.0) })
                .OrderByDescending(t => t.Plays).ThenByDescending(t => t.Minutes).Take(10).ToList();

            result.TopSongs = withSong
                .GroupBy(x => x.Play.Id)
                .Select(g => new TopEntry { Id = g.Key, Name = g.First().Song!.Name ?? string.Empty, Artist = ArtistOf(g.First().Song!), Plays = g.Count(), Minutes = (int)Math.Round(g.Sum(x => x.Play.Sec) / 60.0) })
                .OrderByDescending(t => t.Plays).ThenByDescending(t => t.Minutes).Take(10).ToList();

            return result;
        }
    }
}
