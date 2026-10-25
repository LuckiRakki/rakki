// LyricsSearch/LyricsIndex.cs
// ─────────────────────────────────────────────────────────────────────────────
// Search songs by their lyrics ("lyrics search", like Spotify). Every song's lyrics
// text: the .ttml sidecar when there is one, else the Spicy Lyrics API cache, else
// whatever Jellyfin itself has (.lrc/.txt/embedded). A search is a plain scan of a
// few MB in memory (milliseconds).
//
// Saved to <plugin data>/lyrics-index.json, so a restart loads it at once. Each entry
// remembers where its lyrics came from and a cheap stamp (the sidecar's or .lrc's
// modified time, the API cache file's time, or the audio file's), so a refresh only
// re-reads songs whose stamp changed; songs without lyrics are remembered too, so
// they aren't asked about again. A full re-read happens weekly.
//
// API lyrics follow the Spicy Lyrics cache and its 30-day rule: an entry whose cache
// file is gone or 30 days old is dropped on the next refresh (nightly, right after
// the cache purge) and never loaded from disk past that age.
// ─────────────────────────────────────────────────────────────────────────────

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.Rakki.Edits;
using Jellyfin.Plugin.Rakki.SpicyLyrics.SpicyApi;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Lyrics;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics.LyricsSearch
{
    public class LyricsSearchHit
    {
        public Guid   ItemId { get; set; }
        /// <summary>The matching line, as written.</summary>
        public string Line   { get; set; } = string.Empty;
    }

    public class LyricsIndex
    {
        /// <summary>One song as saved: where its lyrics came from, its stamp, the lines.</summary>
        public sealed class StoredEntry
        {
            public Guid     Id    { get; set; }
            /// <summary>"ttml:…", "api:…" or "own:…": source and stamp in one.</summary>
            public string   Key   { get; set; } = string.Empty;
            public DateTime ApiFetchedUtc { get; set; }
            public string[] Lines { get; set; } = Array.Empty<string>();
        }

        private sealed class StoredIndex
        {
            public int Version { get; set; } = 1;
            public DateTime FullReadUtc { get; set; }
            public List<StoredEntry> Entries { get; set; } = new();
        }

        private sealed record Entry(StoredEntry Stored, string[] NormLines, string Norm);

        private static readonly TimeSpan FullReadEvery = TimeSpan.FromDays(7);
        private static readonly string[] OwnLyricExts = { ".lrc", ".elrc", ".txt" };

        private readonly ILibraryManager _library;
        private readonly ILyricManager _lyrics;
        private readonly TTMLLyricProvider _ttml;
        private readonly SpicyLyricsService _spicy;
        private readonly ILogger<LyricsIndex> _logger;
        private readonly SongEdits _made;
        private readonly SemaphoreSlim _building = new(1, 1);

        private Dictionary<Guid, Entry> _entries = new();
        private DateTime _fullReadUtc = DateTime.MinValue;
        private bool _ready;

        public LyricsIndex(ILibraryManager library, ILyricManager lyrics, TTMLLyricProvider ttml,
                           SpicyLyricsService spicy, SongEdits made, ILogger<LyricsIndex> logger)
        {
            _made    = made;
            _library = library;
            _lyrics  = lyrics;
            _ttml    = ttml;
            _spicy   = spicy;
            _logger  = logger;
        }

        public bool IsReady => _ready;
        public int  Count   => _entries.Values.Count(e => e.Stored.Lines.Length > 0);

        private static string FilePath =>
            Path.Combine(Plugin.Instance?.DataFolderPath ?? throw new InvalidOperationException("Plugin not initialised."),
                         "lyrics-index.json");

        /// <summary>Loads the saved index (if any) so searches work at once after a restart.</summary>
        public void EnsureLoaded()
        {
            if (_ready) return;
            try
            {
                if (!File.Exists(FilePath)) return;
                using var stream = File.OpenRead(FilePath);
                var stored = JsonSerializer.Deserialize<StoredIndex>(stream);
                if (stored is null || stored.Version != 1) return;
                var now = DateTime.UtcNow;
                _entries = stored.Entries
                    // API lyrics are never kept past the Spicy Lyrics cache's 30 days.
                    .Where(e => !e.Key.StartsWith("api:", StringComparison.Ordinal) || now - e.ApiFetchedUtc < SpicyLyricsService.MaxAge)
                    .ToDictionary(e => e.Id, Make);
                _fullReadUtc = stored.FullReadUtc;
                _ready = true;
                _logger.LogInformation("Spicy Lyrics: loaded the lyrics search index ({Count} songs with lyrics).", Count);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Spicy Lyrics: couldn't load the saved lyrics index; it will be rebuilt.");
            }
        }

        private static Entry Make(StoredEntry s)
        {
            var norm = s.Lines.Select(Normalize).ToArray();
            return new Entry(s, norm, " " + string.Join(" ", norm) + " ");
        }

        /// <summary>
        /// Brings the index up to date: only songs whose lyrics source or stamp changed are
        /// read again (everything, once a week). Concurrent calls wait for the one running.
        /// </summary>
        public async Task BuildAsync(IProgress<double>? progress, CancellationToken ct)
        {
            await _building.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                EnsureLoaded();
                var full = DateTime.UtcNow - _fullReadUtc >= FullReadEvery;
                var items = _library.GetItemList(new InternalItemsQuery
                {
                    IncludeItemTypes = new[] { BaseItemKind.Audio },
                    Recursive        = true,
                }).OfType<Audio>().ToList();

                var next = new Dictionary<Guid, Entry>(items.Count);
                var read = 0;
                for (var i = 0; i < items.Count; i++)
                {
                    ct.ThrowIfCancellationRequested();
                    var item = items[i];
                    var (key, apiFetched) = KeyOf(item);
                    if (!full && _entries.TryGetValue(item.Id, out var known) && known.Stored.Key == key)
                    {
                        next[item.Id] = known;
                    }
                    else
                    {
                        var lines = await LinesOf(item, key, ct).ConfigureAwait(false);
                        next[item.Id] = Make(new StoredEntry { Id = item.Id, Key = key, ApiFetchedUtc = apiFetched, Lines = lines });
                        read++;
                    }
                    if (i % 250 == 0) progress?.Report(100.0 * i / Math.Max(1, items.Count));
                }

                var changed = read > 0 || next.Count != _entries.Count || full;
                _entries = next;
                if (full) _fullReadUtc = DateTime.UtcNow;
                _ready = true;
                if (changed) Save();
                progress?.Report(100);
                _logger.LogInformation("Spicy Lyrics: lyrics search index has {Count} songs with lyrics ({Read} read again{Full}).",
                    Count, read, full ? ", weekly full read" : string.Empty);
            }
            finally
            {
                _building.Release();
            }
        }

        private void Save()
        {
            try
            {
                var stored = new StoredIndex { FullReadUtc = _fullReadUtc, Entries = _entries.Values.Select(e => e.Stored).ToList() };
                var temp = FilePath + ".tmp";
                using (var stream = File.Create(temp)) JsonSerializer.Serialize(stream, stored);
                File.Move(temp, FilePath, overwrite: true);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Spicy Lyrics: couldn't save the lyrics index.");
            }
        }

        /// <summary>Where the song's lyrics come from right now, and a stamp that changes when they do.</summary>
        private (string Key, DateTime ApiFetched) KeyOf(Audio item)
        {
            var made = _made.MadeLyricsPath(item.Id);
            if (made is not null) return ($"made:{File.GetLastWriteTimeUtc(made).Ticks}", default);

            var sidecar = Sidecars.FindTtml(item);
            if (sidecar is not null) return ($"ttml:{File.GetLastWriteTimeUtc(sidecar).Ticks}", default);

            var api = _spicy.CacheStamp(item);
            if (api is not null) return ($"api:{api.Value.SpotifyId}:{api.Value.FetchedUtc.Ticks}", api.Value.FetchedUtc);

            var dir = Path.GetDirectoryName(item.Path);
            var stem = Path.GetFileNameWithoutExtension(item.Path);
            if (dir is not null)
            {
                foreach (var ext in OwnLyricExts)
                {
                    var f = Path.Combine(dir, stem + ext);
                    if (File.Exists(f)) return ($"own:{ext}:{File.GetLastWriteTimeUtc(f).Ticks}", default);
                }
            }
            // Embedded lyrics (or none): they change with the audio file.
            return ($"own:audio:{item.DateModified.Ticks}", default);
        }

        private async Task<string[]> LinesOf(Audio item, string key, CancellationToken ct)
        {
            try
            {
                if (key.StartsWith("made:", StringComparison.Ordinal))
                {
                    var made = _made.MadeLyricsPath(item.Id);
                    if (made is not null) return Clean(_ttml.ParseTTMLFile(made).Lines.Select(l => l.Text));
                }
                else if (key.StartsWith("ttml:", StringComparison.Ordinal))
                {
                    var sidecar = Sidecars.FindTtml(item);
                    if (sidecar is not null) return Clean(_ttml.ParseTTMLFile(sidecar).Lines.Select(l => l.Text));
                }
                else if (key.StartsWith("api:", StringComparison.Ordinal))
                {
                    var cached = _spicy.GetCached(item);
                    if (cached is not null) return Clean(cached.Lines.Select(l => l.Text));
                }
                else
                {
                    var own = await _lyrics.GetLyricsAsync(item, ct).ConfigureAwait(false);
                    if (own?.Lyrics is not null) return Clean(own.Lyrics.Select(l => l.Text));
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Lyrics index: skipped {Path}", item.Path);
            }
            return Array.Empty<string>();
        }

        private static string[] Clean(IEnumerable<string?> lines) =>
            lines.Select(l => (l ?? string.Empty).Trim()).Where(l => l.Length > 0).ToArray();

        /// <summary>
        /// Songs whose lyrics contain the words typed, best first: the whole phrase in one
        /// line, then the phrase across lines, then every word somewhere in the song.
        /// </summary>
        public IReadOnlyList<LyricsSearchHit> Search(string query, int limit)
        {
            var q = Normalize(query);
            if (q.Length < 3) return Array.Empty<LyricsSearchHit>();
            var words = q.Split(' ', StringSplitOptions.RemoveEmptyEntries);

            var scored = new List<(int Score, LyricsSearchHit Hit)>();
            foreach (var e in _entries.Values)
            {
                if (e.Stored.Lines.Length == 0) continue;
                int score;
                var line = Array.FindIndex(e.NormLines, l => (" " + l + " ").Contains(" " + q + " ", StringComparison.Ordinal));
                if (line < 0) line = Array.FindIndex(e.NormLines, l => l.Contains(q, StringComparison.Ordinal));
                if (line >= 0)
                {
                    score = 3;
                }
                else if (e.Norm.Contains(" " + q + " ", StringComparison.Ordinal))
                {
                    score = 2;
                    line = Array.FindIndex(e.NormLines, l => l.Contains(words[0], StringComparison.Ordinal));
                }
                else if (words.Length > 1 && words.All(w => e.Norm.Contains(" " + w + " ", StringComparison.Ordinal)))
                {
                    score = 1;
                    // The line with the most of the words.
                    line = e.NormLines
                        .Select((l, i) => (Count: words.Count(w => (" " + l + " ").Contains(" " + w + " ", StringComparison.Ordinal)), i))
                        .OrderByDescending(x => x.Count).First().i;
                }
                else
                {
                    continue;
                }
                scored.Add((score, new LyricsSearchHit { ItemId = e.Stored.Id, Line = e.Stored.Lines[Math.Max(0, line)] }));
            }

            return scored.OrderByDescending(s => s.Score).Take(limit).Select(s => s.Hit).ToList();
        }

        private static readonly Regex NonWord = new(@"[^\p{L}\p{N}]+", RegexOptions.Compiled);

        /// <summary>Lowercase, no accents or punctuation, single spaces ("Don't  Stop!" -> "dont stop").</summary>
        public static string Normalize(string s)
        {
            var decomposed = s.ToLowerInvariant().Replace("'", "").Replace("’", "").Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder(decomposed.Length);
            foreach (var ch in decomposed)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sb.Append(ch);
            }
            return NonWord.Replace(sb.ToString(), " ").Trim();
        }
    }
}
