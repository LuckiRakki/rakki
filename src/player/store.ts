// Phase 0 player: one expo-audio player + a simple queue. Works in Expo Go (foreground).
// Phase 1 replaces the engine with @rntp/player (background, lock screen, preload/gapless)
// behind the same store API, so screens don't change.
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { artistLine } from '@/lib/items';
import { ticksToSeconds } from '@/lib/format';

interface PlayerState {
  queue: BaseItem[];
  index: number;
  playing: boolean;
  buffering: boolean;
  /** Seconds. */
  position: number;
  /** Seconds. */
  duration: number;
  error: string | null;
  playQueue(tracks: BaseItem[], startIndex?: number): void;
  toggle(): void;
  next(auto?: boolean): void;
  previous(): void;
  seek(seconds: number): void;
  stop(): void;
}

let player: AudioPlayer | null = null;
let audioModeReady = false;

async function prepareAudioMode() {
  if (audioModeReady) return;
  audioModeReady = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  } catch {
    // Expo Go can refuse background mode; foreground playback still works.
  }
}

function onStatus(s: AudioStatus) {
  const state = usePlayer.getState();
  const track = state.queue[state.index];
  const fallback = ticksToSeconds(track?.RunTimeTicks);
  usePlayer.setState({
    playing: s.playing,
    buffering: s.isBuffering,
    position: s.currentTime,
    duration: s.duration > 0 && Number.isFinite(s.duration) ? s.duration : fallback,
    error: s.error ?? null,
  });
  if (s.didJustFinish) state.next(true);
}

function ensurePlayer(): AudioPlayer {
  if (!player) {
    player = createAudioPlayer(null, { updateInterval: 250 });
    player.addListener('playbackStatusUpdate', onStatus);
  }
  return player;
}

function load(index: number) {
  const { queue } = usePlayer.getState();
  const track = queue[index];
  const client = useAuth.getState().client;
  if (!track || !client) return;
  void prepareAudioMode();
  const p = ensurePlayer();
  usePlayer.setState({
    index,
    position: 0,
    duration: ticksToSeconds(track.RunTimeTicks),
    buffering: true,
    error: null,
  });
  p.replace({ uri: client.streamUrl(track.Id) });
  p.play();
  try {
    p.setActiveForLockScreen(true, {
      title: track.Name,
      artist: artistLine(track),
      albumTitle: track.Album,
      artworkUrl: client.imageUrl(track, 600),
    });
  } catch {
    // Lock-screen controls need the dev build (Phase 1); ignore in Expo Go.
  }
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  buffering: false,
  position: 0,
  duration: 0,
  error: null,

  playQueue(tracks, startIndex = 0) {
    if (tracks.length === 0) return;
    set({ queue: tracks });
    load(Math.min(Math.max(startIndex, 0), tracks.length - 1));
  },

  toggle() {
    const p = player;
    if (!p || get().queue.length === 0) return;
    if (p.playing) p.pause();
    else p.play();
  },

  next(auto = false) {
    const { index, queue } = get();
    if (index + 1 < queue.length) {
      load(index + 1);
    } else if (auto && player) {
      player.pause();
      void player.seekTo(0);
      set({ playing: false, position: 0 });
    }
  },

  previous() {
    const { index, position } = get();
    if (position > 3 || index === 0) {
      void player?.seekTo(0);
      set({ position: 0 });
    } else {
      load(index - 1);
    }
  },

  seek(seconds) {
    void player?.seekTo(seconds);
    set({ position: seconds });
  },

  stop() {
    if (player) {
      player.pause();
      try {
        player.clearLockScreenControls();
      } catch {}
    }
    set({ queue: [], index: 0, playing: false, position: 0, duration: 0, error: null });
  },
}));
