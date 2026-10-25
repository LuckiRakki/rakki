// Which lyrics a song shows, when it has more than one kind (0.4). A song can have lyrics made in
// Rakki, lyrics from the Spicy Lyrics API, a .ttml file next to it, and Jellyfin's own (.lrc or
// embedded). Automatic picks as before (made in Rakki, then the API or the file by the
// SpicyApiPriority setting, never an unsynced API copy over a file). Sometimes the API has
// word-by-word lyrics while the file is better, so a person can pick one for the song: the
// choice is song-wide, like audio edits, kept in rakki/lyrics-sources.json, and every Rakki
// (phone, desktop, older versions too) gets the chosen lyrics from /SpicyLyrics/{id}/ttml.
// "jellyfin" makes that answer 404, so apps show Jellyfin's lyrics.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Rakki.Configuration;
using Jellyfin.Plugin.Rakki.Edits;
using Jellyfin.Plugin.Rakki.SpicyLyrics.SpicyApi;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities.Audio;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics
{
    public sealed class LyricsSourceOption
    {
        /// <summary>"made", "spicy" or "local".</summary>
        public string Source { get; set; } = string.Empty;
        /// <summary>"word" (word by word), "line" (line by line) or "plain" (not synced).</summary>
        public string Kind { get; set; } = string.Empty;
        public int Lines { get; set; }
    }

    public class LyricsSources
    {
        public const string Auto = "auto";
        public const string Made = "made";
        public const string Spicy = "spicy";
        public const string Local = "local";
        public const string Jellyfin = "jellyfin";

        private static readonly HashSet<string> Known = new() { Made, Spicy, Local, Jellyfin };

        private readonly string _file;
        private readonly SemaphoreSlim _gate = new(1, 1);
        private readonly TTMLLyricProvider _ttml;
        private readonly SpicyLyricsService _spicy;
        private readonly SongEdits _made;
        private readonly ILogger<LyricsSources> _logger;
        private Dictionary<string, string>? _choices;

        public LyricsSources(IApplicationPaths paths, TTMLLyricProvider ttml, SpicyLyricsService spicy, SongEdits made, ILogger<LyricsSources> logger)
        {
            _file = Path.Combine(paths.DataPath, "rakki", "lyrics-sources.json");
            _ttml = ttml;
            _spicy = spicy;
            _made = made;
            _logger = logger;
        }

        public static bool IsKnown(string? source) => source is not null && (source == Auto || Known.Contains(source));

        private static string Key(Guid id) => id.ToString("N");

        // ── The choices ──────────────────────────────────────────────────────

        private Dictionary<string, string> Load()
        {
            if (_choices is not null) return _choices;
            var choices = new Dictionary<string, string>();
            try
            {
                if (File.Exists(_file))
                {
                    foreach (var (k, v) in JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(_file)) ?? new())
                        if (Known.Contains(v)) choices[k] = v;
                }
            }
            catch (JsonException)
            {
                File.Copy(_file, _file + ".bad", true);
            }
            return _choices = choices;
        }

        /// <summary>The song's chosen source, or "auto".</summary>
        public string ChoiceFor(Guid id)
        {
            _gate.Wait();
            try
            {
                return Load().TryGetValue(Key(id), out var v) ? v : Auto;
            }
            finally
            {
                _gate.Release();
            }
        }

        /// <summary>Every song's choice, by item id (no dashes).</summary>
        public Dictionary<string, string> All()
        {
            _gate.Wait();
            try
            {
                return new Dictionary<string, string>(Load());
            }
            finally
            {
                _gate.Release();
            }
        }

        /// <summary>Picks the song's source ("auto" goes back to picking automatically).</summary>
        public async Task SetAsync(Guid id, string source, CancellationToken ct)
        {
            await _gate.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                var choices = Load();
                if (source == Auto) choices.Remove(Key(id));
                else choices[Key(id)] = source;
                Directory.CreateDirectory(Path.GetDirectoryName(_file)!);
                // Written whole, then swapped in, so a reader never sees half a file.
                await File.WriteAllTextAsync(_file + ".tmp", JsonSerializer.Serialize(choices), ct).ConfigureAwait(false);
                File.Move(_file + ".tmp", _file, true);
            }
            finally
            {
                _gate.Release();
            }
        }

        // ── The lyrics of each source ────────────────────────────────────────

        private TTMLResponseDto? MadeLyrics(Audio item)
        {
            var path = _made.MadeLyricsPath(item.Id);
            if (path is null) return null;
            try
            {
                var made = _ttml.ParseTTMLFile(path);
                made.Source = "rakki";
                var by = _made.MadeLyricsInfo(item.Id)?.By;
                if (!string.IsNullOrEmpty(by)) made.Attribution = new AttributionDto { Maker = new AttributionPersonDto { Username = by } };
                return made.Lines.Count > 0 ? made : null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error parsing lyrics made in Rakki: {Path}", path);
                return null;
            }
        }

        /// <summary>The .ttml file's lyrics; throws when the file can't be read (the caller says so).</summary>
        private TTMLResponseDto? LocalLyrics(Audio item)
        {
            var path = Sidecars.FindTtml(item);
            if (path is null) return null;
            var dto = _ttml.ParseTTMLFile(path);
            return dto.Lines.Count > 0 ? dto : null;
        }

        private async Task<TTMLResponseDto?> SpicyLyrics(Audio item, PluginConfiguration cfg, CancellationToken ct)
        {
            if (!SpicyLyricsService.IsConfigured(cfg)) return null;
            var spicy = await _spicy.GetOrFetchAsync(item, cfg, ct).ConfigureAwait(false);
            return spicy is not null && spicy.Lines.Count > 0 ? spicy : null;
        }

        private static bool IsSynced(TTMLResponseDto d) => d.IsSynced || d.Lines.Exists(l => l.Words.Count > 0);

        /// <summary>One source's lyrics, or null when the song has none from it.</summary>
        public async Task<TTMLResponseDto?> FromAsync(Audio item, string source, CancellationToken ct)
        {
            var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
            switch (source)
            {
                case Made: return MadeLyrics(item);
                case Local: return LocalLyrics(item);
                case Spicy: return await SpicyLyrics(item, cfg, ct).ConfigureAwait(false);
                case Jellyfin: return null;
            }

            // Automatic: made in Rakki first (someone made them for this song). Then the Spicy
            // Lyrics API: when SpicyApiPriority is on it is tried first and the file is the
            // fallback; otherwise it only fills gaps for songs that have no file. Anti-downgrade:
            // never replace a file with UNSYNCED API text.
            var made = MadeLyrics(item);
            if (made is not null) return made;
            var hasFile = Sidecars.FindTtml(item) is not null;
            if (cfg.SpicyApiPriority || !hasFile)
            {
                var spicy = await SpicyLyrics(item, cfg, ct).ConfigureAwait(false);
                if (spicy is not null && (IsSynced(spicy) || !hasFile)) return spicy;
            }
            return hasFile ? LocalLyrics(item) : null;
        }

        /// <summary>
        /// The lyrics /SpicyLyrics/{id}/ttml answers with: the song's chosen source when it has
        /// lyrics there (Chosen = true), else automatic. Null for none, or when Jellyfin's are chosen.
        /// </summary>
        public async Task<TTMLResponseDto?> ForSongAsync(Audio item, CancellationToken ct)
        {
            var choice = ChoiceFor(item.Id);
            if (choice == Jellyfin) return null;
            if (choice != Auto)
            {
                TTMLResponseDto? chosen = null;
                try
                {
                    chosen = await FromAsync(item, choice, ct).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Couldn't read the chosen lyrics ({Source}) for {Item}", choice, item.Name);
                }
                if (chosen is not null) return Marked(chosen);
            }
            return await FromAsync(item, Auto, ct).ConfigureAwait(false);
        }

        /// <summary>A copy marked as picked (the API cache's own object stays as it is).</summary>
        private static TTMLResponseDto Marked(TTMLResponseDto d) => new()
        {
            IsSynced = d.IsSynced,
            Lines = d.Lines,
            Songwriters = d.Songwriters,
            Source = d.Source,
            Attribution = d.Attribution,
            Chosen = true,
        };

        /// <summary>The kinds of lyrics the song has here (Jellyfin's own are the app's to check).</summary>
        public async Task<List<LyricsSourceOption>> OptionsAsync(Audio item, CancellationToken ct)
        {
            var options = new List<LyricsSourceOption>();
            foreach (var source in new[] { Made, Spicy, Local })
            {
                TTMLResponseDto? d;
                try
                {
                    d = await FromAsync(item, source, ct).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Couldn't read {Source} lyrics for {Item}", source, item.Name);
                    continue;
                }
                if (d is null) continue;
                options.Add(new LyricsSourceOption
                {
                    Source = source,
                    Kind = d.Lines.Exists(l => l.Words.Count > 0) ? "word" : d.IsSynced ? "line" : "plain",
                    Lines = d.Lines.Count,
                });
            }
            return options;
        }
    }
}
