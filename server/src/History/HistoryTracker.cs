// History and Stats (Rakki 2.0): every song you play, from any app on any device (Jellyfin tells
// every plugin when playback stops). Kept per user in <plugin data>/history-<user>.json, newest
// last, at most MaxPlays entries. GET /Rakki/History and /Rakki/Stats read it (HistoryController).
//
// What counts as a play: at least 30 seconds heard, or half the song for songs under a minute,
// or played to the end. Shorter stops (skips, a queue being replaced) don't.

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.History
{
    public sealed class PlayRecord
    {
        /// <summary>The song.</summary>
        public Guid Id { get; set; }
        /// <summary>When it stopped (UTC).</summary>
        public DateTime At { get; set; }
        /// <summary>Seconds heard.</summary>
        public int Sec { get; set; }
        /// <summary>The device's name ("Lucki's iPhone").</summary>
        public string Dev { get; set; } = string.Empty;
        /// <summary>The app ("Rakki", "Rakki Desktop", "Jellyfin Web").</summary>
        public string App { get; set; } = string.Empty;
    }

    public sealed class HistoryTracker : IDisposable
    {
        private const int MaxPlays = 100_000;
        private static readonly long MinHeardTicks = TimeSpan.FromSeconds(30).Ticks;

        private readonly ISessionManager _sessions;
        private readonly ILogger<HistoryTracker> _logger;
        private readonly ConcurrentDictionary<Guid, List<PlayRecord>> _byUser = new();
        private readonly object _lock = new();
        private readonly HashSet<Guid> _unsaved = new();
        private Timer? _saveTimer;

        public HistoryTracker(ISessionManager sessions, ILogger<HistoryTracker> logger)
        {
            _sessions = sessions;
            _logger = logger;
        }

        public void Start() => _sessions.PlaybackStopped += OnStopped;

        private static string PathFor(Guid user) => Path.Combine(
            Plugin.Instance?.DataFolderPath ?? throw new InvalidOperationException("Plugin not initialised."),
            $"history-{user:N}.json");

        /// <summary>A copy of a user's plays, oldest first.</summary>
        public List<PlayRecord> For(Guid user)
        {
            lock (_lock) return new List<PlayRecord>(Load(user));
        }

        private List<PlayRecord> Load(Guid user) => _byUser.GetOrAdd(user, u =>
        {
            try
            {
                var p = PathFor(u);
                return File.Exists(p) ? JsonSerializer.Deserialize<List<PlayRecord>>(File.ReadAllText(p)) ?? new() : new();
            }
            catch (Exception e)
            {
                _logger.LogWarning(e, "Rakki: history file unreadable, starting a new one");
                return new();
            }
        });

        private void OnStopped(object? sender, PlaybackStopEventArgs e)
        {
            try
            {
                if (e.Item is not Audio song) return;
                var run = song.RunTimeTicks ?? 0;
                var at = e.PlayedToCompletion ? run : e.PlaybackPositionTicks ?? 0;
                var needed = run > 0 ? Math.Min(MinHeardTicks, run / 2) : MinHeardTicks;
                if (!e.PlayedToCompletion && at < needed) return;
                var record = new PlayRecord
                {
                    Id = song.Id,
                    At = DateTime.UtcNow,
                    Sec = (int)Math.Round(TimeSpan.FromTicks(Math.Max(0, at)).TotalSeconds),
                    Dev = e.DeviceName ?? e.Session?.DeviceName ?? string.Empty,
                    App = e.ClientName ?? e.Session?.Client ?? string.Empty,
                };
                lock (_lock)
                {
                    foreach (var user in e.Users)
                    {
                        var plays = Load(user.Id);
                        plays.Add(record);
                        if (plays.Count > MaxPlays) plays.RemoveRange(0, plays.Count - MaxPlays);
                        _unsaved.Add(user.Id);
                    }
                    _saveTimer ??= new Timer(_ => Save(), null, TimeSpan.FromSeconds(30), Timeout.InfiniteTimeSpan);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Rakki: couldn't note a play");
            }
        }

        public void Save()
        {
            lock (_lock)
            {
                _saveTimer?.Dispose();
                _saveTimer = null;
                foreach (var user in _unsaved.ToList())
                {
                    try
                    {
                        var p = PathFor(user);
                        Directory.CreateDirectory(Path.GetDirectoryName(p)!);
                        File.WriteAllText(p + ".tmp", JsonSerializer.Serialize(_byUser[user]));
                        File.Move(p + ".tmp", p, true);
                        _unsaved.Remove(user);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Rakki: couldn't save history");
                    }
                }
            }
        }

        public void Dispose()
        {
            _sessions.PlaybackStopped -= OnStopped;
            Save();
        }
    }
}
