// Lyrics for a SUB/WAVE station: which of your songs is on air, and where you are in it.
//
// Icecast sends a burst of recent audio when you connect (WALT: about 22 s at 192 kbps), so
// you hear everything that much later than the station plays it. The burst is measured once
// per station (how much arrives at once, against the steady rate) and combined with when the
// song started on the station and how far the player has got since the stream connected.
import { useQuery } from '@tanstack/react-query';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { matchKey } from '@/lib/lastfm';
import { engine } from '@/player/engine';

/** Wall-clock time the stream (re)connected. */
let connectedAt = 0;
/** How far the player had got last time we looked (to notice the stream starting over). */
let lastPlayed = 0;

export function noteRadioConnect() {
  connectedAt = Date.now();
  lastPlayed = 0;
}

/** Seconds of past audio each stream sends on connect. */
const bursts = new Map<string, number>();
const measuring = new Set<string>();
/** Until measured: about what a default SUB/WAVE station sends. */
const DEFAULT_BURST_S = 20;
/** Liquidsoap → Icecast encoding delay. */
const ENCODER_S = 1;
const MEASURE_MS = 3000;

/**
 * Measure a stream's burst: connect, see how much arrives in 3 s, and take off what the
 * steady bitrate accounts for. One short extra connection per station and launch.
 */
export function measureBurst(streamUrl: string) {
  if (bursts.has(streamUrl) || measuring.has(streamUrl)) return;
  measuring.add(streamUrl);
  const xhr = new XMLHttpRequest();
  let bytesPerSec = 0;
  let start = 0;
  let loaded = 0;
  const finish = () => {
    if (!measuring.has(streamUrl)) return;
    measuring.delete(streamUrl);
    const seconds = (Date.now() - start) / 1000;
    if (bytesPerSec > 0 && loaded > 0) {
      const burst = (loaded - seconds * bytesPerSec) / bytesPerSec;
      if (burst > 0 && burst < 120) bursts.set(streamUrl, burst);
    }
    xhr.abort();
  };
  xhr.onreadystatechange = () => {
    if (xhr.readyState !== xhr.HEADERS_RECEIVED) return;
    start = Date.now();
    const kbps =
      Number(xhr.getResponseHeader('icy-br')) ||
      Number(/bitrate=(\d+)/.exec(xhr.getResponseHeader('ice-audio-info') ?? '')?.[1]) ||
      0;
    bytesPerSec = (kbps * 1000) / 8;
    setTimeout(finish, MEASURE_MS);
  };
  xhr.onprogress = (e) => {
    loaded = e.loaded;
  };
  xhr.onerror = () => measuring.delete(streamUrl);
  xhr.open('GET', streamUrl);
  xhr.send();
}

/** Milliseconds into the song you're hearing, given when it started on the station. */
export function radioPositionMs(startedAtMs: number, streamUrl: string): number {
  const burst = bursts.get(streamUrl) ?? DEFAULT_BURST_S;
  const played = engine.getProgress().position;
  // The stream started over without us connecting it (it dropped and reconnected, or was
  // started again from the lock screen): it connected about `played` seconds ago.
  if (played + 1 < lastPlayed) connectedAt = Date.now() - played * 1000;
  lastPlayed = played;
  const heard = connectedAt + (played - burst - ENCODER_S) * 1000;
  return heard - startedAtMs;
}

/** The song in your library that's on air (same title and artist), if you have it. */
export function useOnAirSong(title: string | undefined, artist: string | undefined) {
  const client = useAuth((s) => s.client);
  return useQuery({
    queryKey: ['radioSong', title, artist],
    enabled: !!client && !!title,
    staleTime: Infinity,
    queryFn: async (): Promise<BaseItem | null> => {
      const { songs } = await client!.search(title!, 20, ['songs']);
      const want = matchKey(title!);
      const by = matchKey(artist ?? '');
      return (
        songs.find(
          (s) =>
            matchKey(s.Name) === want &&
            (!by || [...(s.Artists ?? []), s.AlbumArtist ?? ''].some((a) => matchKey(a) === by)),
        ) ?? null
      );
    },
  });
}
