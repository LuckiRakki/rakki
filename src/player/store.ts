// The player: queue model + UI state in JS, audio in the engine (src/player/engine.ts).
// The queue is the source of truth; the engine gets a copy of it and reports back which entry
// is playing. Entries carry a unique `key`, so the same song can be queued more than once.
import * as Network from 'expo-network';
import { AppState } from 'react-native';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { localArtUri, localAudioUri } from '@/downloads/store';
import { emitLikedChanged } from '@/lib/events';
import { ticksToSeconds } from '@/lib/format';
import { isOffline } from '@/lib/online';
import { readPref, writePref } from '@/lib/prefs';
import { artistLine } from '@/lib/items';
import { engine, type RakkiTrack, type RepeatMode } from '@/player/engine';
import { reporter } from '@/player/reporting';
import { useSettings } from '@/settings/store';
import { showToast } from '@/ui/overlays';

export interface QueueEntry {
  key: string;
  item: BaseItem;
  /**
   * 'queued' = added with Play next / Add to queue (Spotify's "Next in queue"); 'autoplay' =
   * similar songs added when the queue was running out.
   */
  origin: 'context' | 'queued' | 'autoplay';
}

export interface QueueSource {
  type: 'album' | 'playlist' | 'artist' | 'tracks' | 'genre' | 'search';
  id?: string;
  name: string;
}

interface PlayerState {
  queue: QueueEntry[];
  index: number;
  playing: boolean;
  buffering: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  source: QueueSource | null;
  error: string | null;
  playQueue(items: BaseItem[], opts?: { startIndex?: number; shuffle?: boolean; source?: QueueSource }): void;
  playNext(items: BaseItem[]): void;
  addToQueue(items: BaseItem[]): void;
  removeAt(index: number): void;
  move(from: number, to: number): void;
  /** Replace everything after the current song (the queue screen's drag-to-reorder). */
  setUpcoming(entries: QueueEntry[]): void;
  skipTo(index: number): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  cycleRepeat(): void;
  toggleShuffle(): void;
  setFavorite(itemId: string, favorite: boolean): void;
  stop(): void;
}

let keyCounter = 0;
const newKey = () => `q${Date.now().toString(36)}${(keyCounter++).toString(36)}`;
/** Queue order before shuffle was turned on, to restore it when turned off. */
let unshuffledKeys: string[] | null = null;
let onCellular = false;

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function maxKbps(): number {
  const s = useSettings.getState();
  return onCellular ? s.cellularBitrate : s.wifiBitrate;
}

/**
 * Volume factor for a song with normalization on. Jellyfin's gain targets -18 LUFS; Rakki aims
 * at -14 (Spotify's "normal"), so loud songs come down and quiet ones stay at full volume
 * (the player can't go above 1).
 */
const TARGET_OFFSET_DB = 4;
function gainFor(item: BaseItem): number {
  if (!useSettings.getState().normalize || item.NormalizationGain === undefined) return 1;
  return Math.min(1, Math.pow(10, (item.NormalizationGain + TARGET_OFFSET_DB) / 20));
}

function toTracks(queue: QueueEntry[]): RakkiTrack[] {
  const client = useAuth.getState().client;
  if (!client) return [];
  const kbps = maxKbps();
  return queue.map(({ key, item }) => ({
    key,
    id: item.Id,
    // Downloaded songs play from the phone, even when online.
    url: localAudioUri(item.Id) ?? client.streamUrl(item.Id, kbps),
    title: item.Name,
    artist: artistLine(item),
    album: item.Album ?? '',
    artworkUrl: localArtUri(item.AlbumId ?? item.Id) ?? client.imageUrl(item, 600) ?? null,
    duration: ticksToSeconds(item.RunTimeTicks),
    gain: gainFor(item),
  }));
}

/** The downloaded ones (offline); says so when none are. */
function playableOffline(items: BaseItem[]): BaseItem[] {
  const playable = items.filter((x) => !!localAudioUri(x.Id));
  if (!playable.length) showToast(items.length === 1 ? 'Not downloaded, so it can’t play offline' : 'None of these are downloaded');
  return playable;
}

function entries(items: BaseItem[], origin: QueueEntry['origin']): QueueEntry[] {
  return items.map((item) => ({ key: newKey(), item, origin }));
}

/** Push a changed queue to the engine without interrupting the current song. */
function syncQueue(queue: QueueEntry[]) {
  const currentKey = usePlayer.getState().queue[usePlayer.getState().index]?.key;
  const index = Math.max(0, queue.findIndex((e) => e.key === currentKey));
  usePlayer.setState({ queue, index });
  void engine.updateQueue(toTracks(queue));
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  buffering: false,
  repeat: 'off',
  shuffle: false,
  source: null,
  error: null,

  playQueue(items, opts = {}) {
    if (isOffline()) {
      // Offline only downloaded songs can play; start from the tapped one if it's there.
      const chosen = items[opts.startIndex ?? 0];
      items = playableOffline(items);
      if (!items.length) return;
      if (opts.startIndex !== undefined) opts = { ...opts, startIndex: Math.max(0, items.findIndex((x) => x.Id === chosen?.Id)) };
    }
    if (items.length === 0) return;
    const shuffle = opts.shuffle ?? get().shuffle;
    let queue = entries(items, 'context');
    let index = Math.min(Math.max(opts.startIndex ?? 0, 0), queue.length - 1);
    unshuffledKeys = null;
    if (shuffle) {
      unshuffledKeys = queue.map((e) => e.key);
      if (opts.startIndex !== undefined) {
        const first = queue[index];
        queue = [first, ...shuffled(queue.filter((e) => e !== first))];
      } else {
        queue = shuffled(queue);
      }
      index = 0;
    }
    set({ queue, index, shuffle, source: opts.source ?? null, error: null, buffering: true });
    void engine.setQueue(toTracks(queue), index, 0, true);
  },

  playNext(items) {
    if (isOffline()) items = playableOffline(items);
    if (!items.length) return;
    const { queue, index } = get();
    if (queue.length === 0) return get().playQueue(items);
    const next = [...queue];
    next.splice(index + 1, 0, ...entries(items, 'queued'));
    syncQueue(next);
  },

  addToQueue(items) {
    if (isOffline()) items = playableOffline(items);
    if (!items.length) return;
    const { queue, index } = get();
    if (queue.length === 0) return get().playQueue(items);
    // After the current song and any songs already added with Play next / Add to queue.
    let pos = index + 1;
    while (queue[pos]?.origin === 'queued') pos++;
    const next = [...queue];
    next.splice(pos, 0, ...entries(items, 'queued'));
    syncQueue(next);
  },

  removeAt(i) {
    const { queue } = get();
    if (!queue[i]) return;
    if (queue.length === 1) return get().stop();
    syncQueue(queue.filter((_, j) => j !== i));
  },

  move(from, to) {
    const { queue } = get();
    if (!queue[from] || to < 0 || to >= queue.length || from === to) return;
    const next = [...queue];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    syncQueue(next);
  },

  setUpcoming(entries) {
    const { queue, index } = get();
    if (!queue.length) return;
    syncQueue([...queue.slice(0, index + 1), ...entries]);
  },

  skipTo(i) {
    if (!get().queue[i]) return;
    set({ index: i });
    void engine.skipTo(i);
  },

  toggle() {
    if (get().queue.length) void engine.togglePlayPause();
  },

  next() {
    void engine.skipToNext();
  },

  previous() {
    void engine.skipToPrevious();
  },

  seek(seconds) {
    void engine.seekTo(seconds);
    reporter.seeked(seconds);
  },

  cycleRepeat() {
    const repeat: RepeatMode = get().repeat === 'off' ? 'all' : get().repeat === 'all' ? 'one' : 'off';
    set({ repeat });
    void engine.setRepeatMode(repeat);
  },

  toggleShuffle() {
    const { queue, index, shuffle } = get();
    if (queue.length === 0) {
      set({ shuffle: !shuffle });
      return;
    }
    if (!shuffle) {
      unshuffledKeys = queue.map((e) => e.key);
      // Keep what's already played, the current song and "Next in queue"; shuffle the rest.
      let pos = index + 1;
      while (queue[pos]?.origin === 'queued') pos++;
      set({ shuffle: true });
      syncQueue([...queue.slice(0, pos), ...shuffled(queue.slice(pos))]);
    } else {
      const byKey = new Map(queue.map((e) => [e.key, e]));
      const restored = (unshuffledKeys ?? []).map((k) => byKey.get(k)).filter((e): e is QueueEntry => !!e);
      const known = new Set(restored.map((e) => e.key));
      // Songs added while shuffled go right after the current one.
      const added = queue.filter((e) => !known.has(e.key));
      const currentKey = queue[index]?.key;
      const at = restored.findIndex((e) => e.key === currentKey);
      const order = at >= 0 ? [...restored.slice(0, at + 1), ...added, ...restored.slice(at + 1)] : [...added, ...restored];
      unshuffledKeys = null;
      set({ shuffle: false });
      syncQueue(order);
    }
  },

  setFavorite(itemId, favorite) {
    const client = useAuth.getState().client;
    set({
      queue: get().queue.map((e) =>
        e.item.Id === itemId ? { ...e, item: { ...e.item, UserData: { ...e.item.UserData, IsFavorite: favorite } } } : e,
      ),
    });
    client
      ?.setFavorite(itemId, favorite)
      .then(emitLikedChanged)
      .catch(() => {
        // Roll back if the server refused.
        set({
          queue: get().queue.map((e) =>
            e.item.Id === itemId ? { ...e, item: { ...e.item, UserData: { ...e.item.UserData, IsFavorite: !favorite } } } : e,
          ),
        });
      });
  },

  stop() {
    reporter.stopped(engine.getProgress().position);
    void engine.stop();
    unshuffledKeys = null;
    set({ queue: [], index: 0, playing: false, buffering: false, source: null, error: null });
  },
}));

// ---- Engine → store --------------------------------------------------------------------

reporter.bind({
  position: () => engine.getProgress().position,
  playing: () => usePlayer.getState().playing,
  repeat: () => usePlayer.getState().repeat,
  shuffle: () => usePlayer.getState().shuffle,
});

engine.subscribe({
  onState(e) {
    const s = usePlayer.getState();
    const found = e.key ? s.queue.findIndex((q) => q.key === e.key) : -1;
    if (e.playing !== s.playing) {
      const position = engine.getProgress().position;
      const entry = s.queue[found >= 0 ? found : s.index];
      if (e.playing && reporter.currentKey === null && entry) {
        // Resuming after the queue ended (or a restart): this is a new listen.
        reporter.started(entry.item, entry.key);
      } else {
        reporter.pausedChanged(!e.playing, position);
      }
    }
    usePlayer.setState({
      playing: e.playing,
      buffering: e.buffering,
      index: found >= 0 ? found : s.index,
    });
  },
  onTrackChange(e) {
    const s = usePlayer.getState();
    const found = s.queue.findIndex((q) => q.key === e.key);
    reporter.stopped(e.previousPosition);
    const entry = s.queue[found];
    // A restored queue loads paused: report the listen when play is pressed, not now.
    if (entry && e.reason !== 'queueEnded' && !loadingRestoredQueue) reporter.started(entry.item, entry.key);
    loadingRestoredQueue = false;
    usePlayer.setState({ index: found >= 0 ? found : s.index, error: null });
  },
  onError(e) {
    usePlayer.setState({ error: e.message });
  },
});

// Wi-Fi vs cellular decides the bitrate cap for songs queued from now on.
function refreshUpcoming() {
  const { queue } = usePlayer.getState();
  if (queue.length) void engine.updateQueue(toTracks(queue));
}

void Network.getNetworkStateAsync()
  .then((state) => {
    onCellular = state.type === Network.NetworkStateType.CELLULAR;
  })
  .catch(() => {});

try {
  Network.addNetworkStateListener((state) => {
    const cellular = state.type === Network.NetworkStateType.CELLULAR;
    if (cellular !== onCellular) {
      onCellular = cellular;
      refreshUpcoming();
    }
  });
} catch {
  // Not available on this platform (web preview).
}

useSettings.subscribe((s, prev) => {
  if (s.wifiBitrate !== prev.wifiBitrate || s.cellularBitrate !== prev.cellularBitrate || s.normalize !== prev.normalize) {
    refreshUpcoming();
  }
  // The engine applies a song's gain when it starts or when the volume is set: re-set it so
  // turning normalization on/off changes the song that's playing too.
  if (s.normalize !== prev.normalize) void engine.setVolume(1);
});

// ---- Remember the queue across restarts --------------------------------------------------
// The queue (with shuffle, repeat and where it came from) is saved when it changes; the
// position every 10 s while playing and when Rakki goes to the background. On launch it comes
// back paused where you left off.

const queueKey = (userId: string) => `rakki.queue.${userId}`;
const positionKey = (userId: string) => `rakki.queuePosition.${userId}`;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let restored = false;
let loadingRestoredQueue = false;

function userId(): string | null {
  return useAuth.getState().session?.userId ?? null;
}

function slimEntry(e: QueueEntry): QueueEntry {
  const { Overview: _o, BackdropImageTags: _b, GenreItems: _g, People: _p, ...item } = e.item;
  return { ...e, item };
}

function writeQueue(id: string) {
  const { queue, index, shuffle, repeat, source } = usePlayer.getState();
  writePref(queueKey(id), JSON.stringify({ v: 1, queue: queue.map(slimEntry), index, shuffle, repeat, source, unshuffledKeys }));
}

function saveQueueSoon() {
  if (saveTimer || !restored) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const id = userId();
    if (id) writeQueue(id);
  }, 1000);
}

/**
 * Before switching accounts: save this account's queue and position right now, then stop
 * saving until the next account's queue has been restored (so stopping playback for the
 * switch can't overwrite either account's saved queue).
 */
export function suspendQueueForSwitch() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const id = userId();
  if (id && restored) {
    writeQueue(id);
    savePosition();
  }
  restored = false;
}

function savePosition() {
  const id = userId();
  if (id && restored && usePlayer.getState().queue.length) writePref(positionKey(id), String(engine.getProgress().position));
}

/** Bring back the last queue, paused at the same spot (once per launch). */
export function restoreQueue(forUser: string) {
  if (restored) return;
  restored = true;
  if (usePlayer.getState().queue.length) return;
  try {
    const saved = JSON.parse(readPref(queueKey(forUser)) ?? 'null') as {
      v?: number;
      queue?: QueueEntry[];
      index?: number;
      shuffle?: boolean;
      repeat?: RepeatMode;
      source?: QueueSource | null;
      unshuffledKeys?: string[] | null;
    } | null;
    if (saved?.v !== 1 || !saved.queue?.length) return;
    const index = Math.min(Math.max(saved.index ?? 0, 0), saved.queue.length - 1);
    const position = Number(readPref(positionKey(forUser)) ?? 0) || 0;
    unshuffledKeys = saved.unshuffledKeys ?? null;
    usePlayer.setState({
      queue: saved.queue,
      index,
      shuffle: !!saved.shuffle,
      repeat: saved.repeat ?? 'off',
      source: saved.source ?? null,
      playing: false,
    });
    void engine.setRepeatMode(saved.repeat ?? 'off');
    loadingRestoredQueue = true;
    void engine.setQueue(toTracks(saved.queue), index, position, false);
  } catch {
    // Nothing usable saved.
  }
}

usePlayer.subscribe((s, prev) => {
  if (s.queue !== prev.queue || s.index !== prev.index || s.shuffle !== prev.shuffle || s.repeat !== prev.repeat) {
    saveQueueSoon();
  }
  if (s.index !== prev.index || s.queue !== prev.queue) void maybeAutoplay();
});
setInterval(() => {
  if (usePlayer.getState().playing) savePosition();
}, 10_000);
AppState.addEventListener('change', (state) => {
  if (state !== 'active') {
    savePosition();
    saveQueueSoon();
  }
});

// ---- Autoplay ------------------------------------------------------------------------
// When the last song in the queue starts, add up to 25 similar songs (Jellyfin's instant mix
// of that song) so the music carries on without a gap. Off with repeat, offline, or in Settings.

let autoplayBusy = false;

async function maybeAutoplay() {
  const s = usePlayer.getState();
  const client = useAuth.getState().client;
  if (!client || autoplayBusy || !s.queue.length || s.index < s.queue.length - 1) return;
  if (!useSettings.getState().autoplay || s.repeat !== 'off' || isOffline()) return;
  autoplayBusy = true;
  try {
    const last = s.queue[s.queue.length - 1].item;
    const mix = await client.getInstantMix(last.Id, 40);
    const have = new Set(usePlayer.getState().queue.map((e) => e.item.Id));
    const fresh = mix.filter((m) => !have.has(m.Id)).slice(0, 25);
    const now = usePlayer.getState();
    if (fresh.length && now.queue.length && now.index >= now.queue.length - 1) {
      syncQueue([...now.queue, ...entries(fresh, 'autoplay')]);
    }
  } catch {
    // No mix this time; the queue just ends.
  } finally {
    autoplayBusy = false;
  }
}

// Web dev preview only: lets tests set up a queue from the browser console without playing.
if (__DEV__ && typeof window !== 'undefined') {
  (globalThis as { __rakkiPlayer?: typeof usePlayer }).__rakkiPlayer = usePlayer;
}
