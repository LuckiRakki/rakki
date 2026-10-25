// What people make in Rakki for a song, kept by the plugin in its own data folder, never in the
// music files (the way the Spicy Lyrics API cache is kept):
// - Audio edits: a small JSON note per song (cut points, gain, EQ, speed, pitch, fades,
//   reverb). The server never touches the audio; the Rakki desktop app applies the edit live
//   while the song plays. All edits sit in one file (rakki/edits.json), a few hundred bytes each.
// - Lyrics made in Rakki (the tap-to-sync lyrics maker): a TTML file per song
//   (rakki/lyrics/<id>.ttml) plus who made it (<id>.json). They come before every other lyrics
//   for the song (SpicyLyricsController), and lyrics search finds them.

using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.Rakki.Edits
{
    public sealed class MadeLyricsInfo
    {
        public string By { get; set; } = string.Empty;
        public DateTime Saved { get; set; }
    }

    public class SongEdits
    {
        private readonly string _dir;
        private readonly SemaphoreSlim _gate = new(1, 1);
        private Dictionary<string, JsonNode?>? _edits;

        public SongEdits(IApplicationPaths paths) => _dir = Path.Combine(paths.DataPath, "rakki");

        private string EditsFile => Path.Combine(_dir, "edits.json");
        private string LyricsDir => Path.Combine(_dir, "lyrics");

        private static string Key(Guid id) => id.ToString("N");

        // ── Audio edits ──────────────────────────────────────────────────────

        private async Task<Dictionary<string, JsonNode?>> LoadAsync(CancellationToken ct)
        {
            if (_edits is not null) return _edits;
            var edits = new Dictionary<string, JsonNode?>();
            if (File.Exists(EditsFile))
            {
                try
                {
                    var json = await File.ReadAllTextAsync(EditsFile, ct).ConfigureAwait(false);
                    if (JsonNode.Parse(json) is JsonObject all)
                        foreach (var (k, v) in all) edits[k] = v?.DeepClone();
                }
                catch (JsonException)
                {
                    // A broken file: start over rather than fail every request (kept as .bad).
                    File.Copy(EditsFile, EditsFile + ".bad", true);
                }
            }
            return _edits = edits;
        }

        private async Task SaveAsync(Dictionary<string, JsonNode?> edits, CancellationToken ct)
        {
            Directory.CreateDirectory(_dir);
            var all = new JsonObject();
            foreach (var (k, v) in edits) all[k] = v?.DeepClone();
            // Written whole, then swapped in, so a reader never sees half a file.
            var tmp = EditsFile + ".tmp";
            await File.WriteAllTextAsync(tmp, all.ToJsonString(), ct).ConfigureAwait(false);
            File.Move(tmp, EditsFile, true);
        }

        /// <summary>Every song's edit, by item id (no dashes).</summary>
        public async Task<string> AllJsonAsync(CancellationToken ct)
        {
            await _gate.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                var all = new JsonObject();
                foreach (var (k, v) in await LoadAsync(ct).ConfigureAwait(false)) all[k] = v?.DeepClone();
                return all.ToJsonString();
            }
            finally
            {
                _gate.Release();
            }
        }

        public async Task<string?> GetJsonAsync(Guid id, CancellationToken ct)
        {
            await _gate.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                return (await LoadAsync(ct).ConfigureAwait(false)).TryGetValue(Key(id), out var v) ? v?.ToJsonString() : null;
            }
            finally
            {
                _gate.Release();
            }
        }

        /// <summary>Sets (or with null, removes) the song's edit. False when there was none to remove.</summary>
        public async Task<bool> SetAsync(Guid id, JsonObject? edit, CancellationToken ct)
        {
            await _gate.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                var edits = await LoadAsync(ct).ConfigureAwait(false);
                bool had;
                if (edit is null) had = edits.Remove(Key(id));
                else
                {
                    had = edits.ContainsKey(Key(id));
                    edits[Key(id)] = edit;
                }
                await SaveAsync(edits, ct).ConfigureAwait(false);
                return had || edit is not null;
            }
            finally
            {
                _gate.Release();
            }
        }

        // ── Lyrics made in Rakki ─────────────────────────────────────────────

        /// <summary>The song's lyrics made in Rakki (a .ttml file), or null.</summary>
        public string? MadeLyricsPath(Guid id)
        {
            var path = Path.Combine(LyricsDir, Key(id) + ".ttml");
            return File.Exists(path) ? path : null;
        }

        public MadeLyricsInfo? MadeLyricsInfo(Guid id)
        {
            var path = Path.Combine(LyricsDir, Key(id) + ".json");
            try
            {
                return File.Exists(path) ? JsonSerializer.Deserialize<MadeLyricsInfo>(File.ReadAllText(path)) : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        public async Task SaveMadeLyricsAsync(Guid id, string ttml, string by, CancellationToken ct)
        {
            await _gate.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                Directory.CreateDirectory(LyricsDir);
                var path = Path.Combine(LyricsDir, Key(id) + ".ttml");
                await File.WriteAllTextAsync(path + ".tmp", ttml, ct).ConfigureAwait(false);
                File.Move(path + ".tmp", path, true);
                var info = new MadeLyricsInfo { By = by, Saved = DateTime.UtcNow };
                await File.WriteAllTextAsync(Path.Combine(LyricsDir, Key(id) + ".json"), JsonSerializer.Serialize(info), ct).ConfigureAwait(false);
            }
            finally
            {
                _gate.Release();
            }
        }

        public bool RemoveMadeLyrics(Guid id)
        {
            var path = Path.Combine(LyricsDir, Key(id) + ".ttml");
            if (!File.Exists(path)) return false;
            File.Delete(path);
            var info = Path.Combine(LyricsDir, Key(id) + ".json");
            if (File.Exists(info)) File.Delete(info);
            return true;
        }
    }
}
