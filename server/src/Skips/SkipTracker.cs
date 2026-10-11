// Skips: songs stopped before halfway, from any app (Jellyfin tells every plugin when playback
// stops, with the position). Kept per user in <plugin data>/skips-<user>.json as a count and the
// last date per song. Daily Mixes leave out songs you mostly skip and play less of the ones you
// skip sometimes (DailyMix/Library.cs).
//
// What counts: a song of a minute or more, stopped between 1 second in and halfway, and not
// played to the end. Stops in the first second (a queue being replaced before anything was
// heard) don't count.

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

namespace Jellyfin.Plugin.Rakki.Skips
{
    public sealed class SkipRecord
    {
        public int      Count { get; set; }
        public DateTime Last  { get; set; }
    }

    public sealed class SkipTracker : IDisposable
    {
        private static readonly long MinRunTicks = TimeSpan.FromSeconds(60).Ticks;
        private static readonly long MinPositionTicks = TimeSpan.FromSeconds(1).Ticks;

        private readonly ISessionManager _sessions;
        private readonly ILogger<SkipTracker> _logger;
        private readonly ConcurrentDictionary<Guid, Dictionary<Guid, SkipRecord>> _byUser = new();
        private readonly object _lock = new();
        private readonly HashSet<Guid> _unsaved = new();
        private Timer? _saveTimer;

        public SkipTracker(ISessionManager sessions, ILogger<SkipTracker> logger)
        {
            _sessions = sessions;
            _logger = logger;
        }

        public void Start() => _sessions.PlaybackStopped += OnStopped;

        private static string PathFor(Guid user) => Path.Combine(
            Plugin.Instance?.DataFolderPath ?? throw new InvalidOperationException("Plugin not initialised."),
            $"skips-{user:N}.json");

        /// <summary>A user's skips (song id → count and last date).</summary>
        public IReadOnlyDictionary<Guid, SkipRecord> For(Guid user)
        {
            lock (_lock) return new Dictionary<Guid, SkipRecord>(Load(user));
        }

        private Dictionary<Guid, SkipRecord> Load(Guid user) => _byUser.GetOrAdd(user, u =>
        {
            try
            {
                var p = PathFor(u);
                return File.Exists(p) ? JsonSerializer.Deserialize<Dictionary<Guid, SkipRecord>>(File.ReadAllText(p)) ?? new() : new();
            }
            catch (Exception e)
            {
                _logger.LogWarning(e, "Rakki: skips file unreadable, starting a new one");
                return new();
            }
        });

        private void OnStopped(object? sender, PlaybackStopEventArgs e)
        {
            try
            {
                if (e.Item is not Audio song || e.PlayedToCompletion) return;
                if (song.RunTimeTicks is not long run || run < MinRunTicks) return;
                if (e.PlaybackPositionTicks is not long at || at < MinPositionTicks || at >= run / 2) return;
                lock (_lock)
                {
                    foreach (var user in e.Users)
                    {
                        var skips = Load(user.Id);
                        if (!skips.TryGetValue(song.Id, out var r)) skips[song.Id] = r = new SkipRecord();
                        r.Count++;
                        r.Last = DateTime.UtcNow;
                        _unsaved.Add(user.Id);
                    }
                    _saveTimer ??= new Timer(_ => Save(), null, TimeSpan.FromSeconds(30), Timeout.InfiniteTimeSpan);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Rakki: couldn't note a skip");
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
                        _logger.LogWarning(ex, "Rakki: couldn't save skips");
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
