// Sidecars.cs
// Finding a song's .ttml sidecar, and shifting all its timings (lyrics offset).

using System;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using MediaBrowser.Controller.Entities.Audio;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics
{
    public static class Sidecars
    {
        /// <summary>The song's word-level sidecar (same name, .ttml or .xml), or null.</summary>
        public static string? FindTtml(Audio item)
        {
            var dir = Path.GetDirectoryName(item.Path);
            if (dir is null) return null;
            var stem = Path.GetFileNameWithoutExtension(item.Path);
            foreach (var ext in new[] { ".ttml", ".xml" })
            {
                var candidate = Path.Combine(dir, stem + ext);
                if (File.Exists(candidate)) return candidate;
            }
            return null;
        }

        // begin="…" / end="…", also inside a JSON-wrapped TTML string (begin=\"…\").
        private static readonly Regex TimeAttr = new(@"\b(begin|end)=(\\?"")([^""\\]+)(\\?"")", RegexOptions.Compiled);

        /// <summary>
        /// Moves every line and word in the sidecar by <paramref name="offsetMs"/> (positive =
        /// later), keeping each time's own format. The first time a file is shifted, the
        /// original is kept next to it as .orig. Returns the number of times changed.
        /// </summary>
        public static int ShiftTtml(string path, int offsetMs)
        {
            var text = File.ReadAllText(path);
            var changed = 0;
            var shifted = TimeAttr.Replace(text, m =>
            {
                var value = m.Groups[3].Value;
                var ms = TTMLLyricProvider.ParseTTMLTime(value);
                changed++;
                return $"{m.Groups[1].Value}={m.Groups[2].Value}{Format(value, Math.Max(0, ms + offsetMs))}{m.Groups[4].Value}";
            });
            if (changed == 0) return 0;

            var original = path + ".orig";
            if (!File.Exists(original)) File.Copy(path, original);
            var temp = path + ".tmp";
            File.WriteAllText(temp, shifted);
            File.Move(temp, path, overwrite: true);
            return changed;
        }

        /// <summary>A time in the same style as <paramref name="like"/> (clock, seconds or ms).</summary>
        private static string Format(string like, int ms)
        {
            var ci = CultureInfo.InvariantCulture;
            if (like.EndsWith("ms", StringComparison.OrdinalIgnoreCase)) return ms.ToString(ci) + "ms";
            if (like.EndsWith("s", StringComparison.OrdinalIgnoreCase)) return (ms / 1000.0).ToString("0.000", ci) + "s";
            var parts = like.Split(':').Length;
            var t = TimeSpan.FromMilliseconds(ms);
            if (parts == 3) return $"{(int)t.TotalHours:00}:{t.Minutes:00}:{t.Seconds:00}.{t.Milliseconds:000}";
            if (parts == 2) return $"{(int)t.TotalMinutes:00}:{t.Seconds:00}.{t.Milliseconds:000}";
            return (ms / 1000.0).ToString("0.000", ci);
        }
    }
}
