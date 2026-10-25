// A song's waveform for the audio editor: the file is read once (the same request as playing
// it, so the server does no extra work), decoded at a low sample rate and squeezed into a few
// thousand peaks, then let go. Kept per song while Rakki runs.
import type { BaseItem } from '@/api/jellyfin';
import { client } from '~/auth/session';

/** Peaks per song: enough for a wide window at full resolution. */
const COUNT = 2400;
/** Decoded this low, a five-minute song is a few megabytes for a moment. */
const RATE = 8000;

export interface Peaks {
  /** 0 to 1, evenly over the song. */
  peaks: Float32Array;
  /** Seconds, as decoded. */
  duration: number;
}

const cache = new Map<string, Promise<Peaks>>();

async function decode(url: string): Promise<AudioBuffer> {
  const data = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.arrayBuffer();
  });
  return new OfflineAudioContext(1, 1, RATE).decodeAudioData(data);
}

function squeeze(buffer: AudioBuffer): Peaks {
  const peaks = new Float32Array(COUNT);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const per = buffer.length / COUNT;
  let loudest = 0;
  for (let i = 0; i < COUNT; i++) {
    const from = Math.floor(i * per);
    const to = Math.min(buffer.length, Math.floor((i + 1) * per));
    let peak = 0;
    for (const ch of channels) {
      for (let j = from; j < to; j++) {
        const v = Math.abs(ch[j]);
        if (v > peak) peak = v;
      }
    }
    peaks[i] = peak;
    if (peak > loudest) loudest = peak;
  }
  // Scaled to the loudest moment, so quiet masters still fill the height.
  if (loudest > 0) for (let i = 0; i < COUNT; i++) peaks[i] /= loudest;
  return { peaks, duration: buffer.duration };
}

/**
 * The song's peaks (0 to 1). The original file first; a format the webview can't decode
 * (ALAC, WMA) is asked for again as a small MP3 the server converts.
 */
export function songPeaks(item: BaseItem): Promise<Peaks> {
  let found = cache.get(item.Id);
  if (!found) {
    const c = client();
    if (!c) return Promise.reject(new Error('Not signed in'));
    const { serverUrl, deviceId, token } = c.session;
    const original = `${serverUrl}/Audio/${item.Id}/stream?${new URLSearchParams({ static: 'true', deviceId, api_key: token })}`;
    const converted = `${serverUrl}/Audio/${item.Id}/stream.mp3?${new URLSearchParams({ audioCodec: 'mp3', audioBitRate: '64000', audioChannels: '1', deviceId, api_key: token })}`;
    found = decode(original)
      .catch(() => decode(converted))
      .then(squeeze);
    found.catch(() => cache.delete(item.Id));
    cache.set(item.Id, found);
  }
  return found;
}
