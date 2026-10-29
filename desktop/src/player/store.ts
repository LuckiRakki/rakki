// The player: the queue and where it is, kept here; mpv (player/engine.ts) only ever holds the
// song that's playing and the next one. Plays are reported to Jellyfin as they happen (play
// counts, "Recently played", Last.fm scrobbling through the server), and the system's media
// controls follow along.
import { create } from 'zustand';

import type { BaseItem, PlaybackInfo } from '@/api/jellyfin';
import { queueReport } from '@/remote/devices';
import { buildSmartQueue } from '@/player/smartQueue';
import { useSettings } from '@/settings/store';
import { client } from '~/auth/session';
import { engine, listenEngine, type FileOptions } from '~/player/engine';
import { kv } from '~/lib/kv';

export type RepeatMode = 'off' | 'all' | 'one';

const TICKS_PER_SECOND = 10_000_000;
const REPORT_EVERY_MS = 10_000;

interface PlayerState {
  queue: BaseItem[];
  index: number;
  playing: boolean;
  buffering: boolean;
  /** Seconds, as of `positionAt` (performance.now()); while playing it runs on from there. */
  position: number;
  positionAt: number;
  duration: number;
  /** Playback speed (an audio edit's speed, audio/edits.ts): song seconds per second. */
  rate: number;
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  /** The queue in its original order, while shuffled (to unshuffle). */
  unshuffled: BaseItem[] | null;
  error: string | null;
  /** The window is hidden to the tray: nothing on screen needs updating. */
  hidden: boolean;

  /** `at`: seconds into the first song (playback moved from another device). */
  playQueue(items: BaseItem[], start?: number, opts?: { shuffle?: boolean; at?: number }): void;
  playAt(index: number): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setRepeat(mode: RepeatMode): void;
  toggleShuffle(): void;
  playNext(items: BaseItem[]): void;
  addToQueue(items: BaseItem[]): void;
  removeAt(index: number): void;
  /** Song options changed (an audio edit saved): the next song gets them again. */
  refreshNext(): void;
}

const VOLUME_KEY = 'rakki.volume';
const savedVolume = Number(kv.getItem(VOLUME_KEY) ?? 80);

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The position right now (it runs on between mpv's reports while playing). */
export function currentPosition(s: Pick<PlayerState, 'position' | 'positionAt' | 'playing' | 'duration'> & { rate?: number }): number {
  const p = s.playing ? s.position + ((performance.now() - s.positionAt) / 1000) * (s.rate ?? 1) : s.position;
  return s.duration > 0 ? Math.min(p, s.duration) : p;
}

function nextIndex(s: Pick<PlayerState, 'queue' | 'index' | 'repeat'>): number | null {
  if (!s.queue.length) return null;
  if (s.repeat === 'one') return s.index;
  if (s.index + 1 < s.queue.length) return s.index + 1;
  return s.repeat === 'all' ? 0 : null;
}

/**
 * The song's file as it is (mpv plays every format, so nothing needs converting), unless a
 * streaming quality is set in Settings, then the server converts it to AAC at that bitrate.
 */
/**
 * mpv options for one song (its audio edit, audio/edits.ts sets this), so they go along when
 * the song is loaded, including as the next song for gapless playback.
 */
let optionsFor: (item: BaseItem | undefined) => FileOptions | null = () => null;
export function setSongOptions(fn: (item: BaseItem | undefined) => FileOptions | null) {
  optionsFor = fn;
}
const rateOf = (item: BaseItem | undefined) => Number(optionsFor(item)?.speed ?? 1) || 1;

function url(item: BaseItem | undefined): string | null {
  // A radio station: its stream (radio/radio.ts).
  if (item?.Radio) return item.Radio.streamUrl;
  const c = client();
  if (!item || !c) return null;
  const kbps = useSettings.getState().wifiBitrate;
  if (kbps > 0) return c.streamUrl(item.Id, kbps);
  const { serverUrl, deviceId, token } = c.session;
  const q = new URLSearchParams({ static: 'true', deviceId, api_key: token });
  return `${serverUrl}/Audio/${item.Id}/stream?${q}`;
}

// ---- Reporting to Jellyfin ----

let session: { itemId: string; playSessionId: string } | null = null;
let reportTimer: ReturnType<typeof setInterval> | null = null;

/** What every report carries besides the position: repeat, shuffle, volume and the queue around
 *  the song (so your other Rakki apps can see it; remote/devices.ts). */
function reportContext(s: PlayerState): Partial<PlaybackInfo> {
  return {
    CanSeek: true,
    PlayMethod: 'DirectStream',
    RepeatMode: s.repeat === 'one' ? 'RepeatOne' : s.repeat === 'all' ? 'RepeatAll' : 'RepeatNone',
    PlaybackOrder: s.shuffle ? 'Shuffle' : 'Default',
    VolumeLevel: s.volume,
    IsMuted: s.volume === 0,
    ...queueReport(s.queue, s.index),
  };
}

function reportProgress(event: 'TimeUpdate' | 'Pause' | 'Unpause') {
  const s = usePlayer.getState();
  const c = client();
  if (!session || !c) return;
  void c
    .reportPlaybackProgress({
      ItemId: session.itemId,
      PlaySessionId: session.playSessionId,
      PositionTicks: Math.round(currentPosition(s) * TICKS_PER_SECOND),
      IsPaused: !s.playing,
      EventName: event,
      ...reportContext(s),
    })
    .catch(() => {});
}

function reportStart(item: BaseItem) {
  const c = client();
  if (!c) return;
  session = { itemId: item.Id, playSessionId: crypto.randomUUID().replace(/-/g, '') };
  void c.reportPlaybackStart({ ItemId: item.Id, PlaySessionId: session.playSessionId, PositionTicks: 0, ...reportContext(usePlayer.getState()) }).catch(() => {});
  if (!reportTimer) reportTimer = setInterval(() => reportProgress('TimeUpdate'), REPORT_EVERY_MS);
}

function reportStopped(position: number) {
  const c = client();
  if (!c || !session) return;
  void c
    .reportPlaybackStopped({ ItemId: session.itemId, PlaySessionId: session.playSessionId, PositionTicks: Math.round(position * TICKS_PER_SECOND) })
    .catch(() => {});
  session = null;
}

// ---- The system's media controls (media keys, Windows' overlay, Linux's MPRIS, the tray) ----
// They follow this computer, unless another device is being controlled (player/remote.ts),
// which then owns them: its song is shown and the keys go to it.

let controlOverride: ((command: string) => boolean) | null = null;
let remoteOwnsMedia = false;

/** player/remote.ts: take the media keys (return true when handled) and the media info. */
export function handOverMedia(override: ((command: string) => boolean) | null) {
  controlOverride = override;
  remoteOwnsMedia = !!override;
  if (!override) showLocalMedia();
}

const media = {
  nowPlaying: (...args: Parameters<typeof engine.nowPlaying>) => (remoteOwnsMedia ? undefined : engine.nowPlaying(...args)),
  playback: (playing: boolean, position: number) => (remoteOwnsMedia ? undefined : engine.playback(playing, position)),
};

function localNowPlaying(item: BaseItem) {
  const c = client();
  return {
    title: item.Name,
    artist: item.Artists?.join(', ') || item.AlbumArtist || '',
    album: item.Album ?? '',
    artwork: item.Radio ? item.Radio.coverUrl : c?.imageUrl(item, 600),
    duration: item.RunTimeTicks ? item.RunTimeTicks / TICKS_PER_SECOND : undefined,
  };
}

/** Show this computer's song in the media controls again (control came back here). */
export function showLocalMedia() {
  const s = usePlayer.getState();
  const item = s.queue[s.index];
  void engine.nowPlaying(item ? localNowPlaying(item) : null);
  if (item) void engine.playback(s.playing, currentPosition(s));
}

/** A new song is on: tell Jellyfin and the system's media controls. */
function songStarted(item: BaseItem | undefined) {
  if (!item) {
    void media.nowPlaying(null);
    return;
  }
  // Normalization: Jellyfin's loudness gain for the song (dB), through mpv's volume-gain.
  const gain = useSettings.getState().normalize ? (item.NormalizationGain ?? 0) : 0;
  void engine.set('volume-gain', Math.max(-20, Math.min(12, gain))).catch(() => {});
  // Radio isn't a Jellyfin item: nothing to report, and no autoplay after it (it never ends).
  if (!item.Radio) {
    setTimeout(() => void maybeExtend(), 4000);
    reportStart(item);
  }
  void media.nowPlaying(localNowPlaying(item));
}

// ---- Autoplay ----

let extending = false;

/**
 * Autoplay: when the last song or two of the queue is on, add songs like the recent ones (the
 * phone app's smart queue: Last.fm's similar songs, the artists listeners like next, your likes,
 * Jellyfin's instant mix). Repeat all/one never needs it.
 */
async function maybeExtend() {
  const s = usePlayer.getState();
  const c = client();
  if (!c || extending || !useSettings.getState().autoplay || s.repeat !== 'off') return;
  if (s.queue.length - s.index > 2) return;
  extending = true;
  try {
    const seeds = s.queue.slice(Math.max(0, s.index - 2), s.index + 1);
    const exclude = new Set(s.queue.map((t) => t.Id));
    const result = await buildSmartQueue(c, seeds, { exclude, count: 25 });
    const songs = result.items.length ? result.items : (await c.getInstantMix(seeds[seeds.length - 1].Id, 25)).filter((t) => !exclude.has(t.Id));
    if (songs.length) usePlayer.getState().addToQueue(songs);
  } catch {
    // Try again with the next song.
  } finally {
    extending = false;
  }
}

// ---- The last queue, kept between launches ----

const QUEUE_KEY = 'rakki.lastQueue';
/** At most this many songs around the current one are kept. */
const KEEP = 500;
/** The restored queue isn't in mpv yet: Play loads it at the saved place. */
let restoredPending = false;

interface SavedQueue {
  queue: BaseItem[];
  index: number;
  position: number;
  repeat: RepeatMode;
  shuffle: boolean;
}

function saveQueue(s: PlayerState) {
  try {
    if (!s.queue.length) return kv.removeItem(QUEUE_KEY);
    const from = Math.max(0, s.index - 100);
    const saved: SavedQueue = {
      queue: s.queue.slice(from, from + KEEP),
      index: s.index - from,
      position: currentPosition(s),
      repeat: s.repeat,
      shuffle: s.shuffle,
    };
    kv.setItem(QUEUE_KEY, JSON.stringify(saved));
  } catch {
    // Storage full: the queue just isn't kept this time.
  }
}

function readQueue(): SavedQueue | null {
  try {
    const v = JSON.parse(kv.getItem(QUEUE_KEY) ?? 'null') as SavedQueue | null;
    return v?.queue?.length ? v : null;
  } catch {
    return null;
  }
}

// ---- The store ----

export const usePlayer = create<PlayerState>((set, get) => {
  /** Load queue[index] into mpv (with the next song behind it). */
  const load = (index: number, start = 0, play = true) => {
    const s = get();
    const item = s.queue[index];
    const current = url(item);
    if (!current) return;
    restoredPending = false;
    reportStopped(currentPosition(s));
    const n = nextIndex({ ...s, index });
    const options = optionsFor(item);
    // A song edit's start point counts as the song's start.
    const from = start > 0 ? start : Number(options?.start ?? 0);
    set({ index, position: from, positionAt: performance.now(), duration: (item.RunTimeTicks ?? 0) / TICKS_PER_SECOND, rate: rateOf(item), playing: play, error: null });
    const next = n === null ? undefined : s.queue[n];
    void engine.load(current, options, url(next), optionsFor(next), start, play).catch((e) => set({ error: String(e), playing: false }));
    songStarted(item);
  };

  /** The song after the current one changed (queue edited, repeat changed): tell mpv. */
  const refreshNext = () => {
    const s = get();
    if (!s.queue.length) return;
    const n = nextIndex(s);
    const next = n === null ? undefined : s.queue[n];
    void engine.setNext(url(next), optionsFor(next)).catch(() => {});
  };

  return {
    queue: [],
    index: 0,
    playing: false,
    buffering: false,
    position: 0,
    positionAt: 0,
    duration: 0,
    rate: 1,
    volume: Number.isFinite(savedVolume) ? savedVolume : 80,
    repeat: 'off',
    shuffle: false,
    unshuffled: null,
    error: null,
    hidden: false,
    refreshNext,

    playQueue(items, start = 0, opts) {
      if (!items.length) return;
      const shuffle = opts?.shuffle ?? get().shuffle;
      if (shuffle) {
        // The picked song first, the rest shuffled behind it.
        const first = items[start];
        const rest = shuffled(items.filter((_, i) => i !== start));
        set({ queue: [first, ...rest], unshuffled: items, shuffle: true });
        load(0, opts?.at ?? 0);
      } else {
        set({ queue: items, unshuffled: null, shuffle: false });
        load(start, opts?.at ?? 0);
      }
    },

    playAt(index) {
      if (index >= 0 && index < get().queue.length) load(index);
    },

    toggle() {
      const s = get();
      if (!s.queue.length) return;
      // The queue from last time: load it where it was left.
      if (restoredPending) {
        restoredPending = false;
        load(s.index, s.position, true);
        return;
      }
      const playing = !s.playing;
      set({ playing, position: currentPosition(s), positionAt: performance.now() });
      void engine.set('pause', !playing);
    },

    next() {
      const s = get();
      if (!s.queue.length) return;
      const n = s.index + 1 < s.queue.length ? s.index + 1 : s.repeat === 'all' ? 0 : null;
      if (n !== null) load(n, 0, s.playing || true);
    },

    previous() {
      const s = get();
      if (!s.queue.length) return;
      if (currentPosition(s) > 3 || s.index === 0) {
        get().seek(0);
        return;
      }
      load(s.index - 1);
    },

    seek(seconds) {
      set({ position: seconds, positionAt: performance.now() });
      if (!restoredPending) void engine.seek(seconds);
    },

    setVolume(volume) {
      const v = Math.max(0, Math.min(100, Math.round(volume)));
      set({ volume: v });
      kv.setItem(VOLUME_KEY, String(v));
      void engine.set('volume', v).catch(() => {});
    },

    setRepeat(mode) {
      set({ repeat: mode });
      refreshNext();
    },

    toggleShuffle() {
      const s = get();
      const current = s.queue[s.index];
      if (!s.shuffle) {
        const rest = shuffled(s.queue.filter((_, i) => i !== s.index));
        set({ shuffle: true, unshuffled: s.queue, queue: current ? [current, ...rest] : rest, index: 0 });
      } else {
        const original = s.unshuffled ?? s.queue;
        const at = current ? original.findIndex((x) => x.Id === current.Id) : 0;
        set({ shuffle: false, unshuffled: null, queue: original, index: Math.max(0, at) });
      }
      refreshNext();
    },

    playNext(items) {
      const s = get();
      if (!s.queue.length) return get().playQueue(items);
      const queue = [...s.queue.slice(0, s.index + 1), ...items, ...s.queue.slice(s.index + 1)];
      set({ queue });
      refreshNext();
    },

    addToQueue(items) {
      const s = get();
      if (!s.queue.length) return get().playQueue(items);
      set({ queue: [...s.queue, ...items] });
      refreshNext();
    },

    removeAt(index) {
      const s = get();
      if (index === s.index) return;
      const queue = s.queue.filter((_, i) => i !== index);
      set({ queue, index: index < s.index ? s.index - 1 : s.index });
      refreshNext();
    },
  };
});

let started = false;

/** Once, at start: follow mpv and the system's media controls. */
export function startPlayer() {
  if (started) return;
  started = true;
  void engine.set('volume', usePlayer.getState().volume).catch(() => {});
  // The queue from last time, paused where it was (Play picks it up there).
  const last = readQueue();
  if (last && !usePlayer.getState().queue.length) {
    const item = last.queue[last.index];
    restoredPending = true;
    usePlayer.setState({
      queue: last.queue,
      index: last.index,
      position: last.position,
      positionAt: performance.now(),
      duration: (item?.RunTimeTicks ?? 0) / TICKS_PER_SECOND,
      repeat: last.repeat,
      shuffle: last.shuffle,
      playing: false,
    });
  }
  // Kept as it changes: at once for the queue, every 10 s for the place in the song, and on the way out.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  usePlayer.subscribe((s, prev) => {
    if (s.queue !== prev.queue || s.index !== prev.index || s.repeat !== prev.repeat || s.shuffle !== prev.shuffle || s.playing !== prev.playing) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveQueue(usePlayer.getState()), 500);
    }
  });
  setInterval(() => usePlayer.getState().playing && saveQueue(usePlayer.getState()), 10_000);
  window.addEventListener('beforeunload', () => saveQueue(usePlayer.getState()));
  // Pausing and resuming are reported at once (your other devices show it), not at the next tick.
  usePlayer.subscribe((s, prev) => {
    if (s.playing !== prev.playing && s.queue[s.index]?.Id === session?.itemId) reportProgress(s.playing ? 'Unpause' : 'Pause');
  });
  // So does the volume once it settles (a remote's slider follows it), not on every step of a drag.
  let volumeTimer: ReturnType<typeof setTimeout> | null = null;
  usePlayer.subscribe((s, prev) => {
    if (s.volume === prev.volume) return;
    if (volumeTimer) clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => reportProgress(usePlayer.getState().playing ? 'TimeUpdate' : 'Pause'), 400);
  });
  void listenEngine({
    onProp(name, value) {
      const now = performance.now();
      switch (name) {
        case 'pause': {
          const s = usePlayer.getState();
          if (!s.queue.length) return;
          const playing = value === false;
          usePlayer.setState({ playing, position: currentPosition(s), positionAt: now });
          void media.playback(playing, currentPosition(s));
          break;
        }
        case 'time-pos':
          if (typeof value === 'number') usePlayer.setState({ position: value, positionAt: now });
          break;
        case 'duration':
          if (typeof value === 'number' && value > 0) usePlayer.setState({ duration: value });
          break;
        case 'paused-for-cache':
          usePlayer.setState({ buffering: value === true });
          break;
        case 'idle-active':
          // Nothing left to play (the queue ran out with repeat off).
          if (value === true && usePlayer.getState().queue.length) {
            reportStopped(usePlayer.getState().duration);
            usePlayer.setState({ playing: false, position: 0, positionAt: now });
            void media.playback(false, 0);
          }
          break;
      }
    },
    onAdvanced() {
      const s = usePlayer.getState();
      const n = nextIndex(s);
      if (n === null) return;
      reportStopped(s.duration);
      const item = s.queue[n];
      usePlayer.setState({ index: n, position: Number(optionsFor(item)?.start ?? 0), positionAt: performance.now(), duration: (item.RunTimeTicks ?? 0) / TICKS_PER_SECOND, rate: rateOf(item) });
      songStarted(item);
      const after = nextIndex({ ...s, index: n });
      const next = after === null ? undefined : s.queue[after];
      void engine.setNext(url(next), optionsFor(next)).catch(() => {});
    },
    onEnd(reason, error) {
      if (reason === 'error') {
        usePlayer.setState({ error: typeof error === 'string' ? error : "This song couldn't be played." });
        usePlayer.getState().next();
      }
    },
    onControl(command) {
      if (controlOverride?.(command)) return;
      const p = usePlayer.getState();
      if (command === 'toggle') p.toggle();
      else if (command === 'play') !p.playing && p.toggle();
      else if (command === 'pause') p.playing && p.toggle();
      else if (command === 'next') p.next();
      else if (command === 'previous') p.previous();
      else if (command === 'stop') p.playing && p.toggle();
      else if (command === 'forward') p.seek(currentPosition(p) + 10);
      else if (command === 'backward') p.seek(Math.max(0, currentPosition(p) - 10));
      else if (command.startsWith('position:')) p.seek(Number(command.slice(9)));
    },
    onHidden(hidden) {
      usePlayer.setState({ hidden });
    },
  });
}
