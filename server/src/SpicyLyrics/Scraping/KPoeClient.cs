// Scraping/KPoeClient.cs
// ─────────────────────────────────────────────────────────────────────────────
// Hosted LyricsPlus/KPoe client + KPoe-JSON-to-TTML builder.
//
// Tries each mirror in order. For each mirror: native /v1/ttml/get first
// (Apple-format TTML; unwraps the QQ/Deezer JSON envelope if present), then
// /v2/lyrics/get JSON (line+syllabus[]) which we convert locally into the same
// leaf-<span>-with-trailing-space shape TTMLLyricProvider expects. A clean 404
// from the first *reachable* mirror is authoritative — the 4 mirrors front the
// same aggregator, so we don't fan out further.
// ─────────────────────────────────────────────────────────────────────────────

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Rakki.SpicyLyrics.Scraping
{
    public class TrackQuery
    {
        public string? Title           { get; set; }
        public string? Artist          { get; set; }
        public string? Album           { get; set; }
        public double  DurationSeconds { get; set; }
        public string? Isrc            { get; set; }
    }

    public class KPoeClient
    {
        private readonly HttpClient _http;
        private readonly ILogger<KPoeClient> _logger;

        public KPoeClient(IHttpClientFactory factory, ILogger<KPoeClient> logger)
        {
            _http = factory.CreateClient("SpicyLyricsKPoe");
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("Jellyfin.SpicyLyrics/1.0");
            _logger = logger;
        }

        public async Task<(string Ttml, string Source)?> FetchAsync(
            TrackQuery query,
            IReadOnlyList<string> servers,
            string sourcePref,
            int timeoutSeconds,
            CancellationToken ct)
        {
            var qs = BuildQueryString(query, sourcePref);

            foreach (var rawBase in servers)
            {
                var baseUri = rawBase.TrimEnd('/');
                var reachable = false;

                // 1) Native TTML. May arrive raw or wrapped in {"ttml":"…", …}.
                var ttml = await TryFetchAsync(
                    $"{baseUri}/v1/ttml/get?{qs}", timeoutSeconds, ct).ConfigureAwait(false);
                if (ttml.body is not null)
                {
                    reachable |= ttml.reachable;
                    var unwrapped = TryUnwrapJsonEnvelope(ttml.body) ?? ttml.body;
                    if (LooksLikeTtml(unwrapped))
                        return (unwrapped, "kpoe:ttml");
                }
                reachable |= ttml.reachable;

                // 2) v2 JSON → build TTML locally.
                var jsonResp = await TryFetchAsync(
                    $"{baseUri}/v2/lyrics/get?{qs}", timeoutSeconds, ct).ConfigureAwait(false);
                if (jsonResp.body is not null)
                {
                    reachable |= jsonResp.reachable;
                    var built = BuildTtmlFromKPoeJson(jsonResp.body, out var synced);
                    if (built is not null)
                        return (built, synced ? "kpoe:v2" : "kpoe:v2(line)");
                }
                reachable |= jsonResp.reachable;

                // First reachable mirror is authoritative; don't bother the rest.
                if (reachable) return null;
            }
            return null;
        }

        private async Task<(string? body, bool reachable)> TryFetchAsync(
            string url, int timeoutSeconds, CancellationToken outerCt)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(outerCt);
            cts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
            try
            {
                using var resp = await _http.GetAsync(url, cts.Token).ConfigureAwait(false);
                var reachable = (int)resp.StatusCode < 500;
                if (!resp.IsSuccessStatusCode) return (null, reachable);
                var body = await resp.Content.ReadAsStringAsync(cts.Token).ConfigureAwait(false);
                return (body, true);
            }
            catch (HttpRequestException) { return (null, false); }
            catch (TaskCanceledException) when (!outerCt.IsCancellationRequested)
            {
                return (null, false);
            }
        }

        // ── Query string ──────────────────────────────────────────────────────

        private static string BuildQueryString(TrackQuery q, string sourcePref)
        {
            var p = HttpUtility.ParseQueryString(string.Empty);
            p["title"]  = q.Title  ?? string.Empty;
            p["artist"] = q.Artist ?? string.Empty;
            p["source"] = sourcePref;
            if (!string.IsNullOrEmpty(q.Album)) p["album"] = q.Album;
            if (q.DurationSeconds > 0)
                p["duration"] = q.DurationSeconds.ToString("0.000", CultureInfo.InvariantCulture);
            if (!string.IsNullOrEmpty(q.Isrc)) p["isrc"] = q.Isrc;
            return p.ToString() ?? string.Empty;
        }

        // ── JSON-envelope detection (mirrors TTMLLyricProvider.LoadTtmlInto) ──

        private static string? TryUnwrapJsonEnvelope(string raw)
        {
            var s = raw.AsSpan().TrimStart();
            if (s.Length == 0 || s[0] != '{') return null;
            try
            {
                using var doc = JsonDocument.Parse(raw);
                if (doc.RootElement.ValueKind == JsonValueKind.Object
                    && doc.RootElement.TryGetProperty("ttml", out var inner)
                    && inner.ValueKind == JsonValueKind.String)
                    return inner.GetString();
            }
            catch (JsonException) { }
            return null;
        }

        private static bool LooksLikeTtml(string text)
        {
            var s = text.AsSpan().TrimStart();
            if (s.Length == 0 || s[0] != '<') return false;
            return text.Contains("<tt", StringComparison.OrdinalIgnoreCase);
        }

        // ── v2 JSON → TTML ────────────────────────────────────────────────────
        // Emits one leaf <span begin end> per syllable, with a literal space text
        // node after any syllable that ends a word (isLineEnding=true). This
        // matches the leaf-span+whitespace convention TTMLLyricProvider's
        // WordText helper reassembles into properly-spaced words.

        private static string? BuildTtmlFromKPoeJson(string json, out bool synced)
        {
            synced = true;
            JsonDocument doc;
            try { doc = JsonDocument.Parse(json); }
            catch (JsonException) { return null; }

            using (doc)
            {
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) return null;

                if (root.TryGetProperty("type", out var typeEl)
                    && typeEl.ValueKind == JsonValueKind.String
                    && string.Equals(typeEl.GetString(), "Line", StringComparison.OrdinalIgnoreCase))
                    synced = false;

                if (!root.TryGetProperty("lyrics", out var lyrics)
                    || lyrics.ValueKind != JsonValueKind.Array
                    || lyrics.GetArrayLength() == 0)
                    return null;

                var sb = new StringBuilder(4096);
                sb.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
                sb.AppendLine(
                    "<tt xmlns=\"http://www.w3.org/ns/ttml\" "
                  + "xmlns:ttm=\"http://www.w3.org/ns/ttml#metadata\" "
                  + "xmlns:itunes=\"http://music.apple.com/lyric-ttml-internal\">");
                sb.AppendLine("  <body>");
                sb.AppendLine("    <div>");

                foreach (var entry in lyrics.EnumerateArray())
                {
                    int lineStart = ToMs(entry, "time");
                    int lineEnd   = lineStart + ToMs(entry, "duration");

                    string agentAttr = string.Empty;
                    if (entry.TryGetProperty("element", out var el)
                        && el.ValueKind == JsonValueKind.Object
                        && el.TryGetProperty("singer", out var singer)
                        && singer.ValueKind == JsonValueKind.String
                        && !string.IsNullOrEmpty(singer.GetString()))
                    {
                        agentAttr = $" ttm:agent=\"{XmlEscape(singer.GetString()!)}\"";
                    }

                    sb.Append("      <p begin=\"").Append(MsToTtml(lineStart))
                      .Append("\" end=\"").Append(MsToTtml(lineEnd)).Append('"')
                      .Append(agentAttr).Append('>');

                    if (entry.TryGetProperty("syllabus", out var syl)
                        && syl.ValueKind == JsonValueKind.Array
                        && syl.GetArrayLength() > 0)
                    {
                        var seg = new StringBuilder();
                        foreach (var sy in syl.EnumerateArray())
                        {
                            var text = sy.TryGetProperty("text", out var t)
                                       && t.ValueKind == JsonValueKind.String
                                ? t.GetString() ?? "" : "";
                            if (text.Length == 0) continue;
                            int ss = ToMs(sy, "time");
                            int se = ss + ToMs(sy, "duration");
                            seg.Append("<span begin=\"").Append(MsToTtml(ss))
                               .Append("\" end=\"").Append(MsToTtml(se)).Append("\">")
                               .Append(XmlEscape(text)).Append("</span>");
                            if (sy.TryGetProperty("isLineEnding", out var le)
                                && le.ValueKind == JsonValueKind.True)
                                seg.Append(' ');
                        }
                        // Trim trailing space we may have appended after the last word.
                        var segStr = seg.ToString();
                        if (segStr.Length > 0 && segStr[^1] == ' ')
                            segStr = segStr[..^1];
                        sb.Append(segStr);
                    }
                    else
                    {
                        var text = entry.TryGetProperty("text", out var t)
                                   && t.ValueKind == JsonValueKind.String
                            ? t.GetString() ?? "" : "";
                        sb.Append(XmlEscape(text));
                    }

                    sb.AppendLine("</p>");
                }

                sb.AppendLine("    </div>");
                sb.AppendLine("  </body>");
                sb.AppendLine("</tt>");
                return sb.ToString();
            }
        }

        // ── Time helpers (mirror ttml.py: seconds-as-number or 'mm:ss.xx') ────

        private static int ToMs(JsonElement parent, string field)
        {
            if (!parent.TryGetProperty(field, out var v)) return 0;
            return v.ValueKind switch
            {
                JsonValueKind.Number => (int)Math.Round(v.GetDouble() * 1000.0),
                JsonValueKind.String => ParseClock(v.GetString() ?? string.Empty),
                _ => 0,
            };
        }

        private static int ParseClock(string s)
        {
            s = s.Trim();
            if (s.Length == 0) return 0;
            if (s.Contains(':'))
            {
                double sec = 0;
                foreach (var part in s.Split(':'))
                {
                    if (!double.TryParse(part, NumberStyles.Float,
                            CultureInfo.InvariantCulture, out var v))
                        return 0;
                    sec = sec * 60 + v;
                }
                return (int)Math.Round(sec * 1000);
            }
            return double.TryParse(s, NumberStyles.Float,
                       CultureInfo.InvariantCulture, out var d)
                ? (int)Math.Round(d * 1000) : 0;
        }

        private static string MsToTtml(int ms)
        {
            if (ms < 0) ms = 0;
            int h = ms / 3_600_000; ms %= 3_600_000;
            int m = ms / 60_000;    ms %= 60_000;
            int sec = ms / 1000;
            int mmm = ms % 1000;
            return h > 0
                ? string.Format(CultureInfo.InvariantCulture, "{0}:{1:00}:{2:00}.{3:000}", h, m, sec, mmm)
                : string.Format(CultureInfo.InvariantCulture, "{0}:{1:00}.{2:000}", m, sec, mmm);
        }

        private static string XmlEscape(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            var sb = new StringBuilder(s.Length);
            foreach (var c in s)
            {
                switch (c)
                {
                    case '<': sb.Append("&lt;"); break;
                    case '>': sb.Append("&gt;"); break;
                    case '&': sb.Append("&amp;"); break;
                    case '"': sb.Append("&quot;"); break;
                    case '\'': sb.Append("&apos;"); break;
                    default: sb.Append(c); break;
                }
            }
            return sb.ToString();
        }
    }
}
