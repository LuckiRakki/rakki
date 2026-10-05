// Lyrics sync offset, per song. Moving the lyrics earlier or later is saved on this phone at
// once; "Save to server" writes it into the lyrics themselves so every app has it:
//  - word-by-word lyrics from a .ttml sidecar: the Spicy Lyrics plugin moves the whole file
//    (every line and word by the same amount; word timings relative to each other stay);
//  - line-by-line lyrics (Jellyfin's own, e.g. .lrc): rewritten with the new times and
//    uploaded through Jellyfin's lyrics API.
// Lyrics from the Spicy Lyrics API can't be written anywhere (its terms forbid keeping them),
// so they only take a phone offset.
// Positive offset = the lyrics come later.
import { create } from 'zustand';

import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { saveLyrics } from '@/downloads/manager';
import { useDownloads } from '@/downloads/store';
import { readPref, writePref } from '@/lib/prefs';
import type { Lyrics } from '@/lyrics/types';

const KEY = 'rakki.lyricsOffsets';

function load(): Record<string, number> {
  try {
    const v = JSON.parse(readPref(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

interface Offsets {
  byItem: Record<string, number>;
  set(itemId: string, ms: number): void;
}

export const useLyricsOffsets = create<Offsets>((set, get) => ({
  byItem: load(),
  set(itemId, ms) {
    const byItem = { ...get().byItem };
    if (Math.round(ms) === 0) delete byItem[itemId];
    else byItem[itemId] = Math.round(ms);
    writePref(KEY, JSON.stringify(byItem));
    set({ byItem });
  },
}));

export const useLyricsOffset = (itemId: string | undefined) => useLyricsOffsets((s) => (itemId ? (s.byItem[itemId] ?? 0) : 0));

/** Where an offset for these lyrics can be saved besides the phone, or why not. */
export function serverSaveFor(l: Lyrics | null): { ok: true; kind: 'ttml' | 'lrc' } | { ok: false; reason: string } {
  if (!l) return { ok: false, reason: 'No lyrics' };
  if (!l.isSynced) return { ok: false, reason: 'These lyrics have no timing' };
  if (l.kind === 'ttml') {
    return l.source
      ? { ok: false, reason: 'Lyrics from the Spicy Lyrics API can only be moved on this phone' }
      : { ok: true, kind: 'ttml' };
  }
  return { ok: true, kind: 'lrc' };
}

function lrcTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 10)); // centiseconds
  const m = Math.floor(total / 6000);
  const s = Math.floor((total % 6000) / 100);
  const cs = total % 100;
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`;
}

/** Line-by-line lyrics as an .lrc file, every line moved by `offsetMs`. */
export function toLrc(l: Lyrics, offsetMs: number): string {
  return l.lines.map((line) => `${lrcTime(line.startMs + offsetMs)}${line.text}`).join('\n') + '\n';
}

/**
 * Write the phone's offset into the lyrics on the server, then clear it here (the lyrics
 * themselves are right now). Downloaded songs get the new lyrics saved again.
 */
export async function saveOffsetToServer(itemId: string, lyrics: Lyrics, offsetMs: number): Promise<void> {
  const client = useAuth.getState().client;
  if (!client) throw new Error('Not signed in');
  const target = serverSaveFor(lyrics);
  if (!target.ok) throw new Error(target.reason);
  if (target.kind === 'ttml') await client.offsetSidecar(itemId, offsetMs);
  else await client.uploadLyrics(itemId, 'lyrics.lrc', toLrc(lyrics, offsetMs));
  useLyricsOffsets.getState().set(itemId, 0);
  if (useDownloads.getState().tracks[itemId]?.lyrics) await saveLyrics(client, itemId);
  await queryClient.invalidateQueries({ queryKey: ['lyrics'] });
}
