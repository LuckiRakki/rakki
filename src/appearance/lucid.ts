// "Lucid" accent: the colour of the album that's playing, or the last one played.
import { useEffect } from 'react';

import { useAuth } from '@/auth/store';
import { blurhashAverage } from '@/lib/blurhash';
import { vividAccent } from '@/lib/color';
import { readPref, writePref } from '@/lib/prefs';
import { usePlayer } from '@/player/store';

const LAST_KEY = 'rakki.lastAccent';

/** The Lucid accent right now, or null when nothing has played yet (caller falls back to Custom). */
export function useLucidAccent(enabled: boolean): string | null {
  const client = useAuth((s) => s.client);
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const rgb = enabled && track && client ? blurhashAverage(client.blurhash(track)) : null;
  const current = rgb ? vividAccent(rgb) : null;

  useEffect(() => {
    if (current) writePref(LAST_KEY, current);
  }, [current]);

  // A radio station has no album colour: your own accent, not the last album's.
  if (!enabled || track?.Radio) return null;
  return current ?? readPref(LAST_KEY);
}
