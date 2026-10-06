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
import { useStations, type Station } from '@/radio/stations';
import { stationImageUri } from '@/radio/stationImage';
import { measureBurst, noteRadioConnect } from '@/radio/sync';
import { reporter } from '@/player/reporting';
import { buildSmartQueue } from '@/player/smartQueue';
import { notePerf } from '@/perf/events';
import { useSettings } from '@/settings/store';
import { showToast } from '@/ui/overlays';

export interface QueueEntry {
  key: string;
  item: BaseItem;
  /**
   * 'queued' = added with Play next / Add to queue (Spotify's "Next in queue"); 'autoplay' =
   * the smart queue's picks, added when the queue was running out.
   */
  origin: 'context' | 'queued' | 'autoplay';
}

export interface QueueSource {
  type: 'album' | 'playlist' | 'artist' | 'tracks' | 'genre' | 'search' | 'radio';
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
  /**
   * `radio`: the songs are seeds (one song, usually): it starts at once and the smart queue
   * fills in behind it (`artist`: an artist's radio, so more of them is fine).
   */
  playQueue(
    items: BaseItem[],
    opts?: { startIndex?: number; shuffle?: boolean; source?: QueueSource; radio?: { artist?: boolean } },
  ): void;
  /** Tune in to a radio station (replaces the queue). */
  playStation(station: Station): void;
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
/** Bumped by every new queue, so picks built for an old one are thrown away. */
let generation = 0;
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
  return queue.map(({ key, item }) => {
    // A radio station: its live stream, with the song on air (no length, no loudness info).
    if (item.Radio) {
      return {
        key,
        id: item.Id,
        url: item.Radio.streamUrl,
        title: item.Name,
        artist: artistLine(item),
        album: item.Album ?? '',
        // The song on air's cover (SUB/WAVE), else your picture for the station.
        artworkUrl: item.Radio.coverUrl ?? item.Radio.imageUri ?? null,
        duration: 0,
        gain: 1,
        live: true,
      };
    }
    return {
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
    };
  });
}

/** A radio station is playing (its stream is the only thing in the queue). */
export function radioPlaying(s: Pick<PlayerState, 'queue' | 'index'> = usePlayer.getState()): boolean {
  return !!s.queue[s.index]?.item.Radio;
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
    generation++;
    set({ queue, index, shuffle, source: opts.source ?? null, error: null, buffering: true });
    // Radio plays with the engine on repeat-one (so a dropped stream reconnects): put the
    // listener's own repeat back.
    void engine.setRepeatMode(get().repeat);
    void engine.setQueue(toTracks(queue), index, 0, true);
    // A song's (or artist's) radio: the first song is playing; now the rest, quietly.
    if (opts.radio) void extendQueue({ count: 50, origin: 'context', artistRadio: !!opts.radio.artist, always: true });
  },

  playStation(station) {
    if (isOffline()) {
      showToast('Radio needs a connection');
      return;
    }
    const item: BaseItem = {
      Id: `radio:${station.id}`,
      Name: station.name,
      Type: 'Radio',
      Album: station.name,
      Radio: { stationId: station.id, streamUrl: station.streamUrl, imageUri: stationImageUri(station.image) },
    };
    const queue = entries([item], 'context');
    useStations.getState().markPlayed(station.id);
    noteRadioConnect();
    // SUB/WAVE: how far behind the station you'll hear it, for the lyrics.
    if (station.apiBase) measureBurst(station.streamUrl);
    unshuffledKeys = null;
    generation++;
    set({ queue, index: 0, source: { type: 'radio', id: station.id, name: station.name }, error: null, buffering: true });
    void engine.setRepeatMode('one');
    void engine.setQueue(toTracks(queue), 0, 0, true);
  },

  playNext(items) {
    if (isOffline()) items = playableOffline(items);
    if (!items.length) return;
    const { queue, index } = get();
    if (queue.length === 0 || radioPlaying()) return get().playQueue(items);
    const next = [...queue];
    next.splice(index + 1, 0, ...entries(items, 'queued'));
    syncQueue(next);
  },

  addToQueue(items) {
    if (isOffline()) items = playableOffline(items);
    if (!items.length) return;
    const { queue, index } = get();
    if (queue.length === 0 || radioPlaying()) return get().playQueue(items);
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
    const s = get();
    if (!s.queue.length) return;
    // A station is stopped, not paused: it starts again live (a fresh connection), not from
    // where it stopped.
    const radio = s.queue[s.index]?.item.Radio;
    const station = radio && !s.playing && !s.buffering && useStations.getState().stations.find((x) => x.id === radio.stationId);
    if (station) return get().playStation(station);
    void engine.togglePlayPause();
  },

  next() {
    if (!radioPlaying()) void engine.skipToNext();
  },

  previous() {
    if (!radioPlaying()) void engine.skipToPrevious();
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
    // A station's stream reconnected (repeat-one): its delay starts over.
    if (s.queue[found]?.item.Radio) noteRadioConnect();
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
  // Radio isn't saved: the last music queue comes back next time instead.
  if (radioPlaying()) return;
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
  // After the change has settled, so a radio that's just started builds its own queue first.
  if (s.index !== prev.index || s.queue !== prev.queue) setTimeout(() => void maybeAutoplay(), 0);
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

// ---- Autoplay and radio ---------------------------------------------------------------
// When the last song in the queue starts, add 25 picks from the smart queue
// (src/player/smartQueue.ts) so the music carries on without a gap. Off with repeat, offline,
// or in Settings. A song's or artist's radio uses the same picks, 50 of them, straight away.

let building = false;

async function maybeAutoplay() {
  const s = usePlayer.getState();
  if (!s.queue.length || s.index < s.queue.length - 1 || radioPlaying(s)) return;
  if (!useSettings.getState().autoplay || s.repeat !== 'off') return;
  await extendQueue({ count: 25, origin: 'autoplay' });
}

/** Add smart-queue picks after the last song (`always`: even if the listener has moved on). */
async function extendQueue(opts: { count: number; origin: QueueEntry['origin']; artistRadio?: boolean; always?: boolean }) {
  const client = useAuth.getState().client;
  const s = usePlayer.getState();
  if (!client || building || !s.queue.length || radioPlaying(s) || isOffline()) return;
  building = true;
  const startedWith = generation;
  try {
    // The last two songs lead (the last one most).
    const seeds = s.queue.slice(-2).map((e) => e.item);
    const exclude = new Set(s.queue.map((e) => e.item.Id));
    let picks: BaseItem[];
    try {
      const result = await buildSmartQueue(client, seeds, { exclude, count: opts.count, artistRadio: opts.artistRadio });
      picks = result.items;
      notePerf('queue', { ms: result.ms, picks: picks.length, offered: result.offered, radio: !!opts.always });
    } catch {
      picks = [];
    }
    // Nothing came back: Jellyfin's instant mix on its own.
    if (!picks.length) {
      const mix = await client.getInstantMix(seeds[seeds.length - 1].Id, 60);
      picks = mix.filter((m) => !exclude.has(m.Id)).slice(0, opts.count);
    }
    const now = usePlayer.getState();
    // A different queue started meanwhile: these were for the old one.
    if (!picks.length || !now.queue.length || generation !== startedWith) return;
    if (!opts.always && now.index < now.queue.length - 1) return;
    const have = new Set(now.queue.map((e) => e.item.Id));
    syncQueue([...now.queue, ...entries(picks.filter((p) => !have.has(p.Id)), opts.origin)]);
  } catch {
    // No picks this time; the queue just ends.
  } finally {
    building = false;
  }
}

// Web dev preview only: lets tests set up a queue from the browser console without playing.
if (__DEV__ && typeof window !== 'undefined') {
  (globalThis as { __rakkiPlayer?: typeof usePlayer }).__rakkiPlayer = usePlayer;
}

/** The station that's on was edited: its new name and picture show in the player and on the lock screen. */
export function refreshPlayingStation(station: Station) {
  const { queue, index, source } = usePlayer.getState();
  const entry = queue[index];
  const radio = entry?.item.Radio;
  if (!radio || radio.stationId !== station.id) return;
  const item: BaseItem = {
    ...entry.item,
    // A plain stream shows the station's name; SUB/WAVE shows the song on air.
    ...(station.apiBase ? {} : { Name: station.name, Album: station.name }),
    Radio: { ...radio, imageUri: stationImageUri(station.image) },
  };
  const next = queue.map((e, i) => (i === index ? { ...e, item } : e));
  usePlayer.setState({ queue: next, source: source?.type === 'radio' ? { ...source, name: station.name } : source });
  void engine.updateQueue(toTracks(next));
}

/**
 * New now-playing info for the radio station that's on (from SUB/WAVE): the song, artist and
 * cover replace the entry's, and the lock screen follows. The stream keeps playing.
 */
export function updateRadioNowPlaying(stationId: string, info: { title: string; artist: string; album?: string; coverUrl?: string }) {
  const { queue, index } = usePlayer.getState();
  const entry = queue[index];
  if (!entry?.item.Radio || entry.item.Radio.stationId !== stationId) return;
  const item: BaseItem = {
    ...entry.item,
    Name: info.title || entry.item.Album || entry.item.Name,
    Artists: info.artist ? [info.artist] : [],
    Album: info.album || entry.item.Album,
    Radio: { ...entry.item.Radio, coverUrl: info.coverUrl },
  };
  if (item.Name === entry.item.Name && item.Artists?.[0] === entry.item.Artists?.[0] && item.Radio?.coverUrl === entry.item.Radio.coverUrl) return;
  const next = queue.map((e, i) => (i === index ? { ...e, item } : e));
  usePlayer.setState({ queue: next });
  void engine.updateQueue(toTracks(next));
}
