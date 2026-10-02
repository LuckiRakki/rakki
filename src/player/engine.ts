// One interface over two audio engines:
//  - native: the Rakki Swift engine (gapless, lock screen, background) in our iOS builds
//  - fallback: expo-audio, one song at a time, for web preview and Expo Go
// The player store talks only to this interface.
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

import {
  RakkiAudio,
  type ErrorEvent,
  type Progress,
  type RakkiTrack,
  type RepeatMode,
  type StateEvent,
  type TrackChangeEvent,
} from '../../modules/rakki-audio';

export type { Progress, RakkiTrack, RepeatMode, StateEvent, TrackChangeEvent, ErrorEvent };

export interface EngineHandlers {
  onState(e: StateEvent): void;
  onTrackChange(e: TrackChangeEvent): void;
  onError(e: ErrorEvent): void;
}

export interface PlayerEngine {
  readonly native: boolean;
  setQueue(tracks: RakkiTrack[], startIndex: number, startPosition: number, autoplay: boolean): Promise<void>;
  updateQueue(tracks: RakkiTrack[]): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  togglePlayPause(): Promise<void>;
  skipToNext(): Promise<void>;
  skipToPrevious(): Promise<void>;
  skipTo(index: number): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  setRepeatMode(mode: RepeatMode): Promise<void>;
  setVolume(volume: number): Promise<void>;
  stop(): Promise<void>;
  getProgress(): Progress;
  /** The visualizer's band levels (0–1, low to high), or null where there are none to read. */
  getLevels(count: number): number[] | null;
  subscribe(handlers: EngineHandlers): () => void;
}

function nativeEngine(mod: NonNullable<typeof RakkiAudio>): PlayerEngine {
  return {
    native: true,
    setQueue: (t, i, p, a) => mod.setQueue(t, i, p, a),
    updateQueue: (t) => mod.updateQueue(t),
    play: () => mod.play(),
    pause: () => mod.pause(),
    togglePlayPause: () => mod.togglePlayPause(),
    skipToNext: () => mod.skipToNext(),
    skipToPrevious: () => mod.skipToPrevious(),
    skipTo: (i) => mod.skipTo(i),
    seekTo: (s) => mod.seekTo(s),
    setRepeatMode: (m) => mod.setRepeatMode(m),
    setVolume: (v) => mod.setVolume(v),
    stop: () => mod.stop(),
    getProgress: () => mod.getProgress(),
    getLevels: (count) => mod.getLevels?.(count) ?? null,
    subscribe(h) {
      const subs = [
        mod.addListener('onState', h.onState),
        mod.addListener('onTrackChange', h.onTrackChange),
        mod.addListener('onError', h.onError),
      ];
      return () => subs.forEach((s) => s.remove());
    },
  };
}

/** Same behaviour as the native engine, one song at a time (small gaps between songs). */
function fallbackEngine(): PlayerEngine {
  let player: AudioPlayer | null = null;
  let tracks: RakkiTrack[] = [];
  let index = 0;
  let repeat: RepeatMode = 'off';
  let intendsToPlay = false;
  let volume = 1;
  let last: Progress = { position: 0, duration: 0, buffered: 0, playing: false };
  const listeners = new Set<EngineHandlers>();
  const emit = {
    state(ended = false) {
      const e: StateEvent = {
        playing: intendsToPlay,
        buffering: intendsToPlay && !last.playing,
        index: tracks.length ? index : null,
        key: tracks[index]?.key ?? null,
        repeatMode: repeat,
        ended,
      };
      listeners.forEach((l) => l.onState(e));
    },
    track(previousKey: string | null, previousPosition: number | null, reason: TrackChangeEvent['reason']) {
      const t = tracks[index];
      if (!t) return;
      const e: TrackChangeEvent = { index, key: t.key, id: t.id, previousKey, previousPosition, reason };
      listeners.forEach((l) => l.onTrackChange(e));
    },
  };

  function ensure(): AudioPlayer {
    if (player) return player;
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(
      () => {},
    );
    player = createAudioPlayer(null, { updateInterval: 250 });
    player.addListener('playbackStatusUpdate', (s: AudioStatus) => {
      const duration = s.duration > 0 && Number.isFinite(s.duration) ? s.duration : (tracks[index]?.duration ?? 0);
      last = { position: s.currentTime, duration, buffered: 0, playing: s.playing };
      if (s.error) {
        listeners.forEach((l) => l.onError({ key: tracks[index]?.key ?? null, index, message: s.error! }));
      }
      if (s.didJustFinish) {
        const endedKey = tracks[index]?.key ?? null;
        const endedDuration = tracks[index]?.duration ?? null;
        const next = repeat === 'one' ? index : index + 1 < tracks.length ? index + 1 : repeat === 'all' ? 0 : null;
        if (next === null) {
          intendsToPlay = false;
          void player?.seekTo(0);
          player?.pause();
          emit.state(true);
        } else {
          load(next, 0);
          emit.track(endedKey, endedDuration, 'ended');
        }
      } else {
        emit.state();
      }
    });
    return player;
  }

  function load(i: number, position: number) {
    const p = ensure();
    index = i;
    const t = tracks[i];
    if (!t) return;
    p.replace({ uri: t.url });
    p.volume = volume * t.gain;
    if (position > 0) void p.seekTo(position);
    last = { position, duration: t.duration, buffered: 0, playing: false };
    if (intendsToPlay) p.play();
  }

  function jump(i: number) {
    const previousKey = tracks[index]?.key ?? null;
    const previousPosition = last.position;
    load(i, 0);
    emit.track(previousKey, previousPosition, 'skip');
    emit.state();
  }

  return {
    native: false,
    async setQueue(t, i, position, autoplay) {
      const previousKey = tracks[index]?.key ?? null;
      const previousPosition = player ? last.position : null;
      tracks = t;
      intendsToPlay = autoplay;
      if (!t.length) return this.stop();
      load(Math.min(Math.max(i, 0), t.length - 1), position);
      emit.track(previousKey, previousPosition, 'skip');
      emit.state();
    },
    async updateQueue(t) {
      const key = tracks[index]?.key;
      tracks = t;
      const i = t.findIndex((x) => x.key === key);
      if (i >= 0) {
        index = i;
        emit.state();
      } else if (t.length) {
        jump(Math.min(index, t.length - 1));
      } else {
        await this.stop();
      }
    },
    async play() {
      if (!tracks.length) return;
      intendsToPlay = true;
      ensure().play();
      emit.state();
    },
    async pause() {
      intendsToPlay = false;
      player?.pause();
      emit.state();
    },
    async togglePlayPause() {
      return intendsToPlay ? this.pause() : this.play();
    },
    async skipToNext() {
      if (index + 1 < tracks.length) jump(index + 1);
      else if (repeat !== 'off' && tracks.length) jump(0);
    },
    async skipToPrevious() {
      if (last.position > 3 || (index === 0 && repeat === 'off')) {
        await player?.seekTo(0);
        last = { ...last, position: 0 };
      } else {
        jump(index > 0 ? index - 1 : tracks.length - 1);
      }
    },
    async skipTo(i) {
      if (i >= 0 && i < tracks.length) jump(i);
    },
    async seekTo(s) {
      await player?.seekTo(s);
      last = { ...last, position: s };
    },
    async setRepeatMode(m) {
      repeat = m;
      emit.state();
    },
    async setVolume(v) {
      volume = v;
      if (player) player.volume = v * (tracks[index]?.gain ?? 1);
    },
    async stop() {
      intendsToPlay = false;
      player?.pause();
      tracks = [];
      index = 0;
      last = { position: 0, duration: 0, buffered: 0, playing: false };
      emit.state();
    },
    getProgress: () => last,
    getLevels: () => null,
    subscribe(h) {
      listeners.add(h);
      return () => listeners.delete(h);
    },
  };
}

export const engine: PlayerEngine = RakkiAudio ? nativeEngine(RakkiAudio) : fallbackEngine();
