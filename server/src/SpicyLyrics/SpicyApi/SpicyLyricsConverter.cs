// SpicyApi/SpicyLyricsConverter.cs
// ─────────────────────────────────────────────────────────────────────────────
// Converts a Spicy Lyrics API "Body" into the same TTMLResponseDto the sidecar
// parser produces, so every client keeps working unchanged.
//
//   Type "Syllable" → Content[].Lead.Syllables / Background[].Syllables
//   Type "Line"     → Content[] with Text + StartTime/EndTime per line
//   Type "Static"   → Lines[].Text (no timing)
//
// Times arrive in SECONDS (floats); the DTO uses integer milliseconds.
// A syllable with IsPartOfWord=true joins the next one without a space.
// OppositeAligned lines become agent "v2" so duets render right-aligned.
// ─────────────────────────────────────────────────────────────────────────────

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics.SpicyApi
{
    public static class SpicyLyricsConverter
    {
        public static TTMLResponseDto Convert(string bodyJson)
        {
            using var doc = JsonDocument.Parse(bodyJson);
            var body = doc.RootElement;
            var type = Str(body, "Type");

            var result = new TTMLResponseDto
            {
                Source      = Str(body, "source"),
                Attribution = ReadAttribution(body),
            };

            if (body.TryGetProperty("SongWriters", out var sw) && sw.ValueKind == JsonValueKind.Array)
            {
                result.Songwriters.AddRange(sw.EnumerateArray()
                    .Select(x => x.ValueKind == JsonValueKind.String ? x.GetString() : null)
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(x => x!.Trim()));
            }

            if (string.Equals(type, "Static", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var l in Arr(body, "Lines").Concat(Arr(body, "Content")))
                {
                    var text = Str(l, "Text").Trim();
                    if (text.Length > 0) result.Lines.Add(new TTMLLineDto { Text = text });
                }
                result.IsSynced = false;
                return result;
            }

            foreach (var c in Arr(body, "Content"))
            {
                var line = new TTMLLineDto
                {
                    Agent = Bool(c, "OppositeAligned") ? "v2" : "v1",
                };

                if (c.TryGetProperty("Lead", out var lead) && lead.ValueKind == JsonValueKind.Object)
                {
                    line.StartMs = Ms(lead, "StartTime");
                    line.EndMs   = Ms(lead, "EndTime");
                    line.Words   = Syllables(lead);
                    line.Text    = line.Words.Count > 0
                        ? string.Concat(line.Words.Select(w => w.Text)).Trim()
                        : Str(lead, "Text").Trim();

                    foreach (var bg in Arr(c, "Background"))
                        line.BgWords.AddRange(Syllables(bg));
                    line.BgText = string.Concat(line.BgWords.Select(w => w.Text)).Trim();
                }
                else
                {
                    // Line-synced: timing lives on the content item itself.
                    line.StartMs = Ms(c, "StartTime");
                    line.EndMs   = Ms(c, "EndTime");
                    line.Text    = Str(c, "Text").Trim();
                }

                if (line.Words.Count > 0 && line.EndMs == 0) line.EndMs = line.Words[^1].EndMs;
                if (line.Words.Count > 0 && line.StartMs == 0) line.StartMs = line.Words[0].StartMs;

                if (!string.IsNullOrWhiteSpace(line.Text) || line.BgWords.Count > 0)
                    result.Lines.Add(line);
            }

            result.IsSynced = result.Lines.Exists(l => l.StartMs > 0 || l.EndMs > 0);
            return result;
        }

        private static List<WordCueDto> Syllables(JsonElement vocal)
        {
            var list = new List<WordCueDto>();
            var syl  = Arr(vocal, "Syllables").ToList();
            for (int i = 0; i < syl.Count; i++)
            {
                var text = Str(syl[i], "Text");
                if (text.Length == 0) continue;
                // Trailing space ends a word, exactly like the sidecar parser's
                // WordText(), so the frontend's word grouping is unchanged.
                var last = i == syl.Count - 1;
                if (!Bool(syl[i], "IsPartOfWord") && !last && !text.EndsWith(' ')) text += " ";
                list.Add(new WordCueDto
                {
                    Text    = text,
                    StartMs = Ms(syl[i], "StartTime"),
                    EndMs   = Ms(syl[i], "EndTime"),
                });
            }
            return list;
        }

        private static AttributionDto? ReadAttribution(JsonElement body)
        {
            if (!body.TryGetProperty("UploadAttribution", out var a) || a.ValueKind != JsonValueKind.Object)
                return null;

            var dto = new AttributionDto
            {
                Uploader = Person(a, "Uploader"),
                Maker    = Person(a, "Maker"),
            };
            return dto.Uploader is null && dto.Maker is null ? null : dto;
        }

        private static AttributionPersonDto? Person(JsonElement a, string name)
        {
            if (!a.TryGetProperty(name, out var p) || p.ValueKind != JsonValueKind.Object) return null;
            var username = Str(p, "username").Trim();
            if (username.Length == 0) return null;   // docs: don't render empty attribution
            var url = Str(p, "url").Trim();
            var avatar = Str(p, "avatar").Trim();
            return new AttributionPersonDto
            {
                Username = username,
                Url      = url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? url : string.Empty,
                Avatar   = avatar.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? avatar : string.Empty,
            };
        }

        // ── JSON helpers (tolerant: missing/odd fields never throw) ──────────

        private static IEnumerable<JsonElement> Arr(JsonElement e, string name) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var a) && a.ValueKind == JsonValueKind.Array
                ? a.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Object).ToList()
                : Enumerable.Empty<JsonElement>();

        private static string Str(JsonElement e, string name) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
                ? v.GetString() ?? string.Empty
                : string.Empty;

        private static bool Bool(JsonElement e, string name) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;

        private static int Ms(JsonElement e, string name) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number
                ? (int)Math.Round(v.GetDouble() * 1000)
                : 0;
    }
}
