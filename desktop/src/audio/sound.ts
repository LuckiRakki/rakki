// Rakki's own sound, inside the page, for the visualizer and the moving backgrounds. Music plays
// in mpv, so the app records mpv's output (src-tauri capture.rs) and streams it here, into a
// small Web Audio graph; a music video plays in the page and is tapped directly. Nothing else
// on the computer is heard (games, calls, other apps).
//
// Recording only runs while something on screen wants the sound (`useSound`), music is playing
// and the window is in view. One AudioContext serves everything.
import { Channel, invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

import { inTauri } from '~/lib/tauri';
import { usePlayer } from '~/player/store';
import { useVideo } from '~/player/video';

const RATE = 48_000;

let ctx: AudioContext | null = null;
let musicBus: GainNode | null = null;
let videoBus: GainNode | null = null;
let feed: AudioWorkletNode | null = null;
let feedReady: Promise<void> | null = null;

export function soundContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ sampleRate: RATE, latencyHint: 'playback' });
    musicBus = ctx.createGain();
    videoBus = ctx.createGain();
    // The music bus is only listened to, never played (mpv plays it): a silent path to the
    // speakers keeps the graph running.
    const silent = ctx.createGain();
    silent.gain.value = 0;
    musicBus.connect(silent).connect(ctx.destination);
  }
  return ctx;
}

// The recorded samples come in chunks; this plays them into the graph from a small buffer,
// dropping the oldest when it falls behind so the picture stays in time with the music.
const FEED_WORKLET = `
class RakkiFeed extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(${RATE});
    this.r = 0; this.w = 0; this.n = 0;
    this.port.onmessage = (e) => {
      const d = e.data, len = this.buf.length;
      for (let i = 0; i < d.length; i++) {
        this.buf[this.w] = d[i];
        this.w = (this.w + 1) % len;
        if (this.n < len) this.n++; else this.r = (this.r + 1) % len;
      }
    };
  }
  process(_, outputs) {
    const out = outputs[0][0], len = this.buf.length;
    if (this.n > 4800) { const skip = this.n - 2400; this.r = (this.r + skip) % len; this.n -= skip; }
    for (let i = 0; i < out.length; i++) {
      if (this.n) { out[i] = this.buf[this.r]; this.r = (this.r + 1) % len; this.n--; } else out[i] = 0;
    }
    return true;
  }
}
registerProcessor('rakki-feed', RakkiFeed);
`;

function ensureFeed(): Promise<void> {
  const c = soundContext();
  feedReady ??= c.audioWorklet
    .addModule(URL.createObjectURL(new Blob([FEED_WORKLET], { type: 'text/javascript' })))
    .then(() => {
      feed = new AudioWorkletNode(c, 'rakki-feed', { numberOfInputs: 0, outputChannelCount: [1] });
      feed.connect(musicBus!);
    });
  return feedReady;
}

// ---- Recording mpv ----

let users = 0;
let stopWatch: (() => void) | null = null;
/** Whether recording is wanted, and whether the app is recording. Starts and stops run one at a
 *  time, each settling towards what's wanted now, so quick open / close never crosses over. */
let wanted = false;
let recording = false;
let settling = false;

async function settle() {
  if (settling || !inTauri) return;
  settling = true;
  try {
    while (recording !== wanted) {
      if (wanted) {
        await ensureFeed();
        const ch = new Channel<ArrayBuffer>();
        ch.onmessage = (buf) => feed?.port.postMessage(new Float32Array(buf), [buf]);
        await invoke('capture_start', { onAudio: ch });
        recording = true;
        await ctx?.resume();
      } else {
        await invoke('capture_stop');
        recording = false;
      }
    }
  } catch {
    // No capture (an older Windows, no PulseAudio): the visualizer stays flat.
    wanted = false;
    recording = false;
  } finally {
    settling = false;
  }
}

/** Recording follows: someone wants it, music is playing, the window is in view, no video. */
function follow() {
  const p = usePlayer.getState();
  wanted = users > 0 && p.playing && !p.hidden && !useVideo.getState().video;
  void settle();
}

function acquire(): () => void {
  users++;
  if (users === 1) {
    const a = usePlayer.subscribe((s, prev) => (s.playing !== prev.playing || s.hidden !== prev.hidden) && follow());
    const b = useVideo.subscribe((s, prev) => s.video !== prev.video && follow());
    stopWatch = () => (a(), b());
  }
  follow();
  return () => {
    users--;
    if (users === 0) {
      stopWatch?.();
      stopWatch = null;
    }
    follow();
  };
}

// ---- Music videos ----

/** Each video element can be tapped once; a new element (the next video) gets its own. */
const tapped = new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>();

/** Route a video's sound through Rakki's graph (it then plays through it, as before). */
export function hearVideo(v: HTMLVideoElement) {
  try {
    const c = soundContext();
    if (!tapped.has(v)) {
      const source = c.createMediaElementSource(v);
      source.connect(c.destination);
      source.connect(videoBus!);
      tapped.set(v, source);
    }
    void c.resume();
  } catch {
    // No Web Audio: the video plays as usual; the visualizer stays flat.
  }
}

/**
 * The sound to show while the calling component is on screen: the open music video's, else the
 * music's (recorded from mpv while needed). Null until there's a graph.
 */
export function useSound(active = true): AudioNode | null {
  const video = useVideo((s) => !!s.video);
  const [bus, setBus] = useState<AudioNode | null>(null);
  useEffect(() => {
    if (!active) return;
    soundContext();
    setBus(video ? videoBus : musicBus);
    if (video) return;
    return acquire();
  }, [active, video]);
  return active ? bus : null;
}

// Development: a stand-in for mpv in a plain browser tab (no recording there), so the
// visualizer and background can be checked. Silent: the music bus never reaches the speakers.
if (import.meta.env.DEV && !inTauri) {
  Object.assign(window, {
    __rakkiTestTone() {
      const c = soundContext();
      const osc = c.createOscillator();
      const lfo = c.createOscillator();
      const depth = c.createGain();
      const amp = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 110;
      lfo.frequency.value = 2;
      depth.gain.value = 0.5;
      amp.gain.value = 0.5;
      lfo.connect(depth).connect(amp.gain);
      osc.connect(amp).connect(musicBus!);
      osc.start();
      lfo.start();
      void c.resume();
    },
  });
}
