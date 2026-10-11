// Taking over from the Spicy Lyrics TTML plugin (merged into this one, 2026-10): at the first
// start, its settings (Jellyfin.Plugin.SpicyLyrics.xml, including the Spicy Lyrics API key) and
// its saved data (lyrics search index, Spicy Lyrics API cache) are copied over. The old files
// are left where they are, so going back to the old plugin still works.

using System;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki
{
    internal static class Migration
    {
        private const string OldName = "Jellyfin.Plugin.SpicyLyrics";

        public static void ImportSpicyLyrics(IApplicationPaths paths, ILogger logger)
        {
            var plugin = Plugin.Instance;
            if (plugin == null || plugin.Configuration.SpicyLyricsImported) return;
            var cfg = plugin.Configuration;
            try
            {
                var xml = Path.Combine(paths.PluginConfigurationsPath, OldName + ".xml");
                if (File.Exists(xml))
                {
                    var root = XDocument.Load(xml).Root!;
                    foreach (var prop in cfg.GetType().GetProperties().Where(p => p.CanWrite))
                    {
                        if (!prop.Name.StartsWith("Scraper", StringComparison.Ordinal)
                            && !prop.Name.StartsWith("Spicy", StringComparison.Ordinal)
                            && prop.Name != "FileExtensions") continue;
                        var el = root.Element(prop.Name);
                        if (el == null) continue;
                        object? value = prop.PropertyType switch
                        {
                            Type t when t == typeof(string)   => el.Value,
                            Type t when t == typeof(bool)     => bool.TryParse(el.Value, out var b) ? b : null,
                            Type t when t == typeof(int)      => int.TryParse(el.Value, out var i) ? i : null,
                            Type t when t == typeof(string[]) => el.Elements().Select(e => e.Value).ToArray(),
                            _ => null,
                        };
                        if (value != null) prop.SetValue(cfg, value);
                    }
                    logger.LogInformation("Rakki: took over the Spicy Lyrics TTML plugin's settings");
                }

                var oldData = Path.Combine(paths.PluginsPath, OldName);
                if (Directory.Exists(oldData))
                {
                    Copy(oldData, plugin.DataFolderPath);
                    logger.LogInformation("Rakki: copied the Spicy Lyrics TTML plugin's saved data");
                }
            }
            catch (Exception e)
            {
                logger.LogError(e, "Rakki: couldn't take over the Spicy Lyrics TTML plugin's settings");
            }
            cfg.SpicyLyricsImported = true;
            plugin.SaveConfiguration();
        }

        /// <summary>Copies a folder's files, leaving any already there alone.</summary>
        private static void Copy(string from, string to)
        {
            Directory.CreateDirectory(to);
            foreach (var f in Directory.EnumerateFiles(from))
            {
                var dest = Path.Combine(to, Path.GetFileName(f));
                if (!File.Exists(dest)) File.Copy(f, dest);
            }
            foreach (var d in Directory.EnumerateDirectories(from)) Copy(d, Path.Combine(to, Path.GetFileName(d)));
        }
    }
}
