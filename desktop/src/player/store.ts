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
import { engine, listenEngine } from '~/player/engine';

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
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  /** The queue in its original order, while shuffled (to unshuffle). */
  unshuffled: BaseItem[] | null;
  error: string | null;
  /** The window is hidden to the tray: nothing on screen needs updating. */
  hidden: boolean;

  playQueue(items: BaseItem[], start?: number, opts?: { shuffle?: boolean }): void;
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
}

const VOLUME_KEY = 'rakki.volume';
const savedVolume = Number(localStorage.getItem(VOLUME_KEY) ?? 80);

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The position right now (it runs on between mpv's reports while playing). */
export function currentPosition(s: Pick<PlayerState, 'position' | 'positionAt' | 'playing' | 'duration'>): number {
  const p = s.playing ? s.position + (performance.now() - s.positionAt) / 1000 : s.position;
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

/** What every report carries besides the position: repeat, shuffle and the queue around the
 *  song (so your other Rakki apps can see it; remote/devices.ts). */
function reportContext(s: PlayerState): Partial<PlaybackInfo> {
  return {
    CanSeek: true,
    PlayMethod: 'DirectStream',
    RepeatMode: s.repeat === 'one' ? 'RepeatOne' : s.repeat === 'all' ? 'RepeatAll' : 'RepeatNone',
    PlaybackOrder: s.shuffle ? 'Shuffle' : 'Default',
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

/** A new song is on: tell Jellyfin and the system's media controls. */
function songStarted(item: BaseItem | undefined) {
  if (!item) {
    void engine.nowPlaying(null);
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
  const c = client();
  void engine.nowPlaying({
    title: item.Name,
    artist: item.Artists?.join(', ') || item.AlbumArtist || '',
    album: item.Album ?? '',
    artwork: item.Radio ? item.Radio.coverUrl : c?.imageUrl(item, 600),
    duration: item.RunTimeTicks ? item.RunTimeTicks / TICKS_PER_SECOND : undefined,
  });
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

// ---- The store ----

export const usePlayer = create<PlayerState>((set, get) => {
  /** Load queue[index] into mpv (with the next song behind it). */
  const load = (index: number, start = 0, play = true) => {
    const s = get();
    const item = s.queue[index];
    const current = url(item);
    if (!current) return;
    reportStopped(currentPosition(s));
    const n = nextIndex({ ...s, index });
    set({ index, position: start, positionAt: performance.now(), duration: (item.RunTimeTicks ?? 0) / TICKS_PER_SECOND, playing: play, error: null });
    void engine.load(current, n === null ? null : url(s.queue[n]), start, play).catch((e) => set({ error: String(e), playing: false }));
    songStarted(item);
  };

  /** The song after the current one changed (queue edited, repeat changed): tell mpv. */
  const refreshNext = () => {
    const s = get();
    if (!s.queue.length) return;
    const n = nextIndex(s);
    void engine.setNext(n === null ? null : url(s.queue[n])).catch(() => {});
  };

  return {
    queue: [],
    index: 0,
    playing: false,
    buffering: false,
    position: 0,
    positionAt: 0,
    duration: 0,
    volume: Number.isFinite(savedVolume) ? savedVolume : 80,
    repeat: 'off',
    shuffle: false,
    unshuffled: null,
    error: null,
    hidden: false,

    playQueue(items, start = 0, opts) {
      if (!items.length) return;
      const shuffle = opts?.shuffle ?? get().shuffle;
      if (shuffle) {
        // The picked song first, the rest shuffled behind it.
        const first = items[start];
        const rest = shuffled(items.filter((_, i) => i !== start));
        set({ queue: [first, ...rest], unshuffled: items, shuffle: true });
        load(0);
      } else {
        set({ queue: items, unshuffled: null, shuffle: false });
        load(start);
      }
    },

    playAt(index) {
      if (index >= 0 && index < get().queue.length) load(index);
    },

    toggle() {
      const s = get();
      if (!s.queue.length) return;
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
      void engine.seek(seconds);
    },

    setVolume(volume) {
      const v = Math.max(0, Math.min(100, Math.round(volume)));
      set({ volume: v });
      localStorage.setItem(VOLUME_KEY, String(v));
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
  // Pausing and resuming are reported at once (your other devices show it), not at the next tick.
  usePlayer.subscribe((s, prev) => {
    if (s.playing !== prev.playing && s.queue[s.index]?.Id === session?.itemId) reportProgress(s.playing ? 'Unpause' : 'Pause');
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
          void engine.playback(playing, currentPosition(s));
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
            void engine.playback(false, 0);
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
      usePlayer.setState({ index: n, position: 0, positionAt: performance.now(), duration: (item.RunTimeTicks ?? 0) / TICKS_PER_SECOND });
      songStarted(item);
      const after = nextIndex({ ...s, index: n });
      void engine.setNext(after === null ? null : url(s.queue[after])).catch(() => {});
    },
    onEnd(reason, error) {
      if (reason === 'error') {
        usePlayer.setState({ error: typeof error === 'string' ? error : "This song couldn't be played." });
        usePlayer.getState().next();
      }
    },
    onControl(command) {
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
