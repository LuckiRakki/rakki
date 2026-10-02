// One lyrics model for both renderers (Spicy and Regular), filled from either source:
//  - the Spicy Lyrics plugin: GET /SpicyLyrics/{id}/ttml  (word timings, background vocals, duets)
//  - Jellyfin's own lyrics:   GET /Audio/{id}/Lyrics       (LRC line timings, or plain text)
// Mirrors the web mod's LyricsPayload (SpicyLyrics-Jellyfin/src/JellyfinAdapter.ts).

export interface WordCue {
  text: string;
  startMs: number;
  endMs: number;
}

export interface LyricLine {
  text: string;
  startMs: number;
  endMs: number;
  /** Word timings (TTML only). */
  words?: WordCue[];
  /** Background-vocal words (TTML ttm:role="x-bg"), with their own timing. */
  bgWords?: WordCue[];
  /** Singer id (TTML ttm:agent, e.g. "v1"/"v2"): duet lines by the second voice sit on the right. */
  agent?: string;
}

export interface AttributionPerson {
  username: string;
  /** Their Spicy Lyrics profile (https), or empty. */
  url: string;
  /** Their Discord profile picture (https), when the plugin passes it on. */
  avatar?: string;
}

export interface Lyrics {
  kind: 'ttml' | 'lrc';
  isSynced: boolean;
  hasWordCues: boolean;
  lines: LyricLine[];
  songwriters?: string[];
  /** Spicy Lyrics API provider: spicy_lyrics | apple_music | spotify. Absent for local files. */
  source?: string;
  /** Community-sync credit (source spicy_lyrics). Must be shown (API Terms). */
  attribution?: { uploader?: AttributionPerson; maker?: AttributionPerson };
}

export interface LyricsBundle {
  ttml: Lyrics | null;
  lrc: Lyrics | null;
}

/** Raw shape of GET /SpicyLyrics/{id}/ttml. */
export interface TtmlDto {
  IsSynced: boolean;
  Lines: {
    Text: string;
    StartMs: number;
    EndMs: number;
    Words?: { Text: string; StartMs: number; EndMs: number }[];
    BgWords?: { Text: string; StartMs: number; EndMs: number }[];
    Agent?: string;
  }[];
  Songwriters?: string[];
  Source?: string;
  Attribution?: {
    Uploader?: { Username: string; Url: string; Avatar?: string } | null;
    Maker?: { Username: string; Url: string; Avatar?: string } | null;
  } | null;
}

/** Raw shape of GET /Audio/{id}/Lyrics. */
export interface JellyfinLyricsDto {
  Metadata?: { IsSynced?: boolean };
  Lyrics?: { Text?: string; Start?: number }[];
}
