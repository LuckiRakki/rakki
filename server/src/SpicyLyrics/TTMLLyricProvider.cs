// TTMLLyricProvider.cs
// ─────────────────────────────────────────────────────────────────────────────
// Scans for .ttml sidecar files alongside audio items and parses them into
// Jellyfin's internal lyric model (LyricLine with word-level cues).
//
// File naming (same directory as the audio file, resolved by
// SpicyLyricsController.FindTTMLPath):
//   <exact-audio-filename>.ttml   (also .xml)
//
// Accepts either raw TTML or a JSON envelope of the form
//   {"ttml":"<tt …>…</tt>","processingTime":{…}}
// returned by some KPoe upstreams (QQ/Deezer); see LoadTtmlInto below.
//
// Jellyfin 10.10.x's ILyricProvider is a remote-search interface and its
// LyricLine model carries no per-word cues, so this provider is not wired into
// the built-in lyrics pipeline. Instead it parses the TTML and the parsed data
// is served via the custom REST controller (SpicyLyricsController.cs) so the
// frontend can consume word-level timing directly.
// ─────────────────────────────────────────────────────────────────────────────

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Xml;
using MediaBrowser.Controller.Entities.Audio;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics
{
    // ── Public DTO (used by the API controller) ───────────────────────────────

    public class WordCueDto
    {
        public string Text    { get; set; } = string.Empty;
        public int    StartMs { get; set; }
        public int    EndMs   { get; set; }
    }

    public class TTMLLineDto
    {
        public string          Text     { get; set; } = string.Empty;
        public int             StartMs  { get; set; }
        public int             EndMs    { get; set; }
        public List<WordCueDto> Words   { get; set; } = new();
        // Background vocals (TTML ttm:role="x-bg"), with their own timing.
        public List<WordCueDto> BgWords { get; set; } = new();
        public string          BgText   { get; set; } = string.Empty;
        // Singer/voice (TTML ttm:agent, e.g. "v1"/"v2") for duet positioning.
        public string          Agent    { get; set; } = string.Empty;
    }

    public class TTMLResponseDto
    {
        public bool              IsSynced    { get; set; }
        public List<TTMLLineDto> Lines       { get; set; } = new();
        // Songwriters from the TTML <iTunesMetadata>, for an end-of-lyrics credit.
        public List<string>      Songwriters { get; set; } = new();
        // Spicy Lyrics API provider that answered ("spicy_lyrics", "apple_music",
        // "spotify"); empty for local sidecars. Clients MUST display it.
        public string            Source      { get; set; } = string.Empty;
        // Community-sync credit; only present when Source is "spicy_lyrics".
        public AttributionDto?   Attribution { get; set; }
    }

    public class AttributionDto
    {
        public AttributionPersonDto? Uploader { get; set; }
        public AttributionPersonDto? Maker    { get; set; }
    }

    public class AttributionPersonDto
    {
        public string Username { get; set; } = string.Empty;
        public string Url      { get; set; } = string.Empty;
        /// <summary>Their Discord profile picture (https, may be an animated GIF); empty if none.</summary>
        public string Avatar   { get; set; } = string.Empty;
    }

    // ── TTML parsing service ──────────────────────────────────────────────────

    public class TTMLLyricProvider
    {
        private readonly ILogger<TTMLLyricProvider> _logger;

        public TTMLLyricProvider(ILogger<TTMLLyricProvider> logger)
        {
            _logger = logger;
        }

        // ── TTML parsing ──────────────────────────────────────────────────────

        public TTMLResponseDto ParseTTMLFile(string path)
        {
            var xml = new XmlDocument();
            // Preserve whitespace so spaces that sit BETWEEN word <span>s (rather
            // than inside them) survive — otherwise the words run together.
            xml.PreserveWhitespace = true;
            LoadTtmlInto(xml, path);

            var result = new TTMLResponseDto();

            // End-of-lyrics credit: songwriters from <iTunesMetadata>.
            var swNodes = xml.SelectNodes("//*[local-name()='songwriter']");
            if (swNodes != null)
            {
                foreach (XmlNode sw in swNodes)
                {
                    var name = sw.InnerText.Trim();
                    if (!string.IsNullOrEmpty(name)) result.Songwriters.Add(name);
                }
            }

            // Namespace-agnostic matching: Apple Music / iTunes TTML usually omits
            // the default TTML namespace (no xmlns="http://www.w3.org/ns/ttml"),
            // so we match elements by local name regardless of namespace. Note
            // SelectNodes returns an EMPTY list (never null) when nothing matches.
            var paragraphs = xml.SelectNodes("//*[local-name()='body']//*[local-name()='p']");
            if (paragraphs == null || paragraphs.Count == 0)
            {
                paragraphs = xml.SelectNodes("//*[local-name()='p']");
            }
            if (paragraphs == null) return result;

            foreach (XmlNode p in paragraphs)
            {
                var lineStartMs = ParseTTMLTime(GetAttr(p, "begin"));
                var lineEndMs   = ParseTTMLTime(GetAttr(p, "end"));

                var lineDto = new TTMLLineDto
                {
                    StartMs = lineStartMs,
                    EndMs   = lineEndMs,
                    Agent   = GetAttr(p, "agent"),
                };

                // Leaf word spans (no nested span), excluding background vocals
                // (ttm:role="x-bg") so we don't duplicate or interleave them.
                var wordNodes = p.SelectNodes(
                    ".//*[local-name()='span']"
                    + "[not(.//*[local-name()='span'])]"
                    + "[not(ancestor-or-self::*[@*[local-name()='role']='x-bg'])]");

                if (wordNodes != null && wordNodes.Count > 0)
                {
                    foreach (XmlNode span in wordNodes)
                    {
                        var text = WordText(span);
                        if (string.IsNullOrEmpty(text)) continue;

                        var wStart = ParseTTMLTime(GetAttr(span, "begin"));
                        var wEnd   = ParseTTMLTime(GetAttr(span, "end"));

                        lineDto.Words.Add(new WordCueDto
                        {
                            Text    = text,
                            StartMs = wStart > 0 ? wStart : lineStartMs,
                            EndMs   = wEnd   > 0 ? wEnd   : lineEndMs,
                        });
                    }
                    lineDto.Text = string.Concat(
                        lineDto.Words.ConvertAll(w => w.Text)).Trim();
                }
                else
                {
                    lineDto.Text = p.InnerText.Trim();
                }

                // Background vocals: leaf spans INSIDE an x-bg group, kept
                // separate so the UI can render them as a smaller sub-line.
                var bgNodes = p.SelectNodes(
                    ".//*[local-name()='span']"
                    + "[not(.//*[local-name()='span'])]"
                    + "[ancestor::*[@*[local-name()='role']='x-bg']]");

                if (bgNodes != null && bgNodes.Count > 0)
                {
                    foreach (XmlNode span in bgNodes)
                    {
                        var text = WordText(span);
                        if (string.IsNullOrEmpty(text)) continue;

                        var wStart = ParseTTMLTime(GetAttr(span, "begin"));
                        var wEnd   = ParseTTMLTime(GetAttr(span, "end"));

                        lineDto.BgWords.Add(new WordCueDto
                        {
                            Text    = text,
                            StartMs = wStart > 0 ? wStart : lineStartMs,
                            EndMs   = wEnd   > 0 ? wEnd   : lineEndMs,
                        });
                    }
                    lineDto.BgText = string.Concat(
                        lineDto.BgWords.ConvertAll(w => w.Text)).Trim();
                }

                if (!string.IsNullOrWhiteSpace(lineDto.Text) || lineDto.BgWords.Count > 0)
                {
                    result.Lines.Add(lineDto);
                }
            }

            // Synced if any line carries timing. (Don't require the FIRST line to
            // start after 0 ms — a song can legitimately begin at 0.)
            result.IsSynced = result.Lines.Exists(l => l.StartMs > 0 || l.EndMs > 0)
                              || result.Lines.Count > 1;
            return result;
        }

        /// <summary>
        /// A word's text, plus a trailing space if the source separated this word
        /// from the next with a whitespace text node (rather than a space inside
        /// the span). Preserves correct spacing for both TTML conventions.
        /// </summary>
        private static string WordText(XmlNode span)
        {
            var text = span.InnerText;
            var next = span.NextSibling;
            if (next != null
                && (next.NodeType == XmlNodeType.Text
                    || next.NodeType == XmlNodeType.Whitespace
                    || next.NodeType == XmlNodeType.SignificantWhitespace)
                && !string.IsNullOrEmpty(next.Value)
                && next.Value.IndexOf(' ') >= 0
                && !text.EndsWith(" "))
            {
                text += " ";
            }
            return text;
        }

        /// <summary>Reads an attribute by local name, ignoring any prefix/namespace.</summary>
        private static string GetAttr(XmlNode node, string localName)
        {
            if (node.Attributes == null) return string.Empty;
            foreach (XmlAttribute a in node.Attributes)
            {
                if (a.LocalName == localName) return a.Value;
            }
            return string.Empty;
        }

        // ── Source-format tolerance ───────────────────────────────────────────

        /// <summary>
        /// Loads a sidecar that may be raw TTML or a JSON envelope wrapping TTML.
        /// Some scrapers (e.g. LyricsPlus/KPoe via the QQ/Deezer upstream) return
        /// <c>{"ttml":"&lt;tt …&gt;…&lt;/tt&gt;","processingTime":{…}}</c> rather
        /// than raw XML; treat both shapes identically.
        /// </summary>
        private static void LoadTtmlInto(XmlDocument xml, string path)
        {
            var raw = File.ReadAllText(path);
            var head = raw.AsSpan().TrimStart();

            if (head.Length > 0 && head[0] == '{')
            {
                try
                {
                    using var json = JsonDocument.Parse(raw);
                    if (json.RootElement.ValueKind == JsonValueKind.Object
                        && json.RootElement.TryGetProperty("ttml", out var inner)
                        && inner.ValueKind == JsonValueKind.String)
                    {
                        var unwrapped = inner.GetString();
                        if (!string.IsNullOrWhiteSpace(unwrapped))
                        {
                            xml.LoadXml(unwrapped);
                            return;
                        }
                    }
                }
                catch (JsonException)
                {
                    // Not actually JSON — fall through and let XmlException surface.
                }
            }

            xml.LoadXml(raw);
        }

        // ── Time parsing ──────────────────────────────────────────────────────

        /// <summary>
        /// Parses a TTML time string into milliseconds.
        /// Supports HH:MM:SS.mmm, MM:SS.mmm, SS.mmm, and metric forms (1234ms, 12.3s).
        /// </summary>
        public static int ParseTTMLTime(string? timeStr)
        {
            if (string.IsNullOrWhiteSpace(timeStr)) return 0;

            var ci = CultureInfo.InvariantCulture;

            // Metric: "1234.5ms" or "12.3s"
            if (timeStr.EndsWith("ms", StringComparison.OrdinalIgnoreCase))
            {
                if (double.TryParse(timeStr[..^2], NumberStyles.Float, ci, out var ms)) return (int)ms;
            }
            else if (timeStr.EndsWith("s", StringComparison.OrdinalIgnoreCase))
            {
                if (double.TryParse(timeStr[..^1], NumberStyles.Float, ci, out var secs)) return (int)(secs * 1000);
            }

            // Clock: HH:MM:SS.mmm or MM:SS.mmm
            var parts = timeStr.Split(':');
            try
            {
                if (parts.Length == 3)
                {
                    double h = double.Parse(parts[0], ci);
                    double m = double.Parse(parts[1], ci);
                    double s = double.Parse(parts[2], ci);
                    return (int)((h * 3600 + m * 60 + s) * 1000);
                }
                if (parts.Length == 2)
                {
                    double m = double.Parse(parts[0], ci);
                    double s = double.Parse(parts[1], ci);
                    return (int)((m * 60 + s) * 1000);
                }
                if (parts.Length == 1)
                {
                    return (int)(double.Parse(parts[0], ci) * 1000);
                }
            }
            catch { /* swallow parse errors */ }

            return 0;
        }
    }
}
