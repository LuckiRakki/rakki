// What a Daily Mix build produces: the six mixes with the reasons behind them (the preview
// endpoint returns this as is), plus the small history file the 3-day rule reads.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace Jellyfin.Plugin.Rakki.DailyMix
{
    public sealed class MixPreview
    {
        public string   Date       { get; set; } = string.Empty;
        public Guid     UserId     { get; set; }
        public DateTime BuiltUtc   { get; set; }
        public double   Seconds    { get; set; }
        public int      LastFmRequests { get; set; }
        public int      Songs      { get; set; }
        public int      Artists    { get; set; }
        /// <summary>Artists who led a mix in the last few days and so can't lead today.</summary>
        public List<string>        Resting    { get; set; } = new();
        public List<GroupInfo>     Groups     { get; set; } = new();
        /// <summary>The likeliest leads before any was drawn, with their chances.</summary>
        public List<LeadCandidate> Candidates { get; set; } = new();
        public List<MixInfo>       Mixes      { get; set; } = new();
        public List<string>        Notes      { get; set; } = new();
    }

    public sealed class GroupInfo
    {
        public int          Id      { get; set; }
        public string       Label   { get; set; } = string.Empty;
        public List<string> Tags    { get; set; } = new();
        public int          Artists { get; set; }
        public int          Songs   { get; set; }
    }

    public sealed class LeadCandidate
    {
        public string Artist    { get; set; } = string.Empty;
        public string Group     { get; set; } = string.Empty;
        public int    Plays     { get; set; }
        public long   Listeners { get; set; }
        public double Score     { get; set; }
        public double ChancePct { get; set; }
    }

    public sealed class MixInfo
    {
        public int    Number { get; set; }
        public string Lead   { get; set; } = string.Empty;
        public string Group  { get; set; } = string.Empty;
        public string Why    { get; set; } = string.Empty;
        /// <summary>Artists the mix draws from, with their likeness to the lead (0–1).</summary>
        public Dictionary<string, double> Neighbours { get; set; } = new();
        public Dictionary<string, int>    Pools      { get; set; } = new();
        public List<MixTrack>             Tracks     { get; set; } = new();
        public List<string>               Notes      { get; set; } = new();
    }

    public sealed class MixTrack
    {
        public Guid   Id          { get; set; }
        public string Name        { get; set; } = string.Empty;
        public string Artist      { get; set; } = string.Empty;
        /// <summary>Opener, Popular, Yours, New or Fill.</summary>
        public string Pool        { get; set; } = string.Empty;
        public int    YourPlays   { get; set; }
        public long   LastFmPlays { get; set; }
    }

    /// <summary>
    /// Each night's leads and songs (kept two weeks) for the 3-day rule and the "not too much of
    /// yesterday" rule. Publishing writes it; previews just read it.
    /// </summary>
    public sealed class MixHistory
    {
        public sealed class Day
        {
            public string       Date  { get; set; } = string.Empty;
            /// <summary>Written to the playlists (false: only a preview was saved).</summary>
            public bool         Published { get; set; }
            public List<string> Leads { get; set; } = new();
            public List<Guid>   Songs { get; set; } = new();
        }

        public List<Day> Days { get; set; } = new();

        private static string PathFor(Guid user) => System.IO.Path.Combine(
            Plugin.Instance?.DataFolderPath ?? throw new InvalidOperationException("Plugin not initialised."),
            $"daily-mix-history-{user:N}.json");

        public static MixHistory Load(Guid user)
        {
            try
            {
                var p = PathFor(user);
                return File.Exists(p) ? JsonSerializer.Deserialize<MixHistory>(File.ReadAllText(p)) ?? new() : new();
            }
            catch (JsonException)
            {
                return new();
            }
        }

        public void Save(Guid user)
        {
            Days = Days.OrderByDescending(d => d.Date, StringComparer.Ordinal).Take(14).ToList();
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(PathFor(user))!);
            File.WriteAllText(PathFor(user), JsonSerializer.Serialize(this));
        }
    }
}
