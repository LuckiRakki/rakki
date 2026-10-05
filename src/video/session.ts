// The music video that's playing, and its queue. Its player lives at the app's root
// (VideoHost), not in the video screen, so swiping the screen down keeps the video going in the
// mini-player; the screen and the mini-player both show that one player. No expo-video import
// here: older builds without it load this file too.
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { matchKey } from '@/lib/lastfm';

/**
 * What to play after `current`: another video by the same artist not seen yet, else any other
 * one not seen, at random. null when there's nothing new.
 */
export function nextVideo(current: BaseItem, videos: BaseItem[] | undefined, seen: Set<string>): BaseItem | null {
  const fresh = (videos ?? []).filter((v) => v.Id !== current.Id && !seen.has(v.Id));
  if (!fresh.length) return null;
  const artists = new Set((current.Artists ?? []).map(matchKey));
  const same = fresh.filter((v) => (v.Artists ?? []).some((a) => artists.has(matchKey(a))));
  const pool = same.length ? same : fresh;
  return pool[Math.floor(Math.random() * pool.length)];
}

interface VideoSession {
  video: BaseItem | null;
  /** expo-video's player for `video` (set by VideoHost; null while it starts). */
  player: unknown;
  /** Watched before this one, oldest first. */
  history: BaseItem[];
  /** What plays after it: more by the same artist first, then anything not watched yet. */
  upNext: BaseItem[];
  /** Seconds left of the "Up next" countdown at the end; null when not counting. */
  countdown: number | null;
  /** Start a video (from a list, a song's menu…): a fresh queue is picked for it. */
  play(video: BaseItem): void;
  /** Jump to a video in Up next (the ones before it are dropped, like Spotify). */
  skipTo(index: number): void;
  next(): void;
  /** Back to the one watched before (this one goes back to the front of Up next). */
  previous(): void;
  /** Back to a watched one. */
  backTo(index: number): void;
  remove(index: number): void;
  setUpNext(list: BaseItem[]): void;
  /**
   * Keep Up next at `size` videos (Settings → Playback → Videos queued ahead): top it up from
   * the library, or cut it down to that. VideoHost, when a video starts or the setting changes.
   */
  fill(videos: BaseItem[] | undefined, size: number): void;
  stop(): void;
}

export const useVideoSession = create<VideoSession>((set, get) => ({
  video: null,
  player: null,
  history: [],
  upNext: [],
  countdown: null,
  play(video) {
    const { video: current, history } = get();
    if (current?.Id === video.Id) return;
    set({ video, history: current ? [...history, current] : [], upNext: [], countdown: null });
  },
  skipTo(index) {
    const { video, history, upNext } = get();
    const target = upNext[index];
    if (!target) return;
    set({
      video: target,
      history: video ? [...history, video] : history,
      upNext: upNext.slice(index + 1),
      countdown: null,
    });
  },
  next() {
    get().skipTo(0);
  },
  previous() {
    get().backTo(get().history.length - 1);
  },
  backTo(index) {
    const { video, history, upNext } = get();
    const target = history[index];
    if (!target) return;
    set({
      video: target,
      history: history.slice(0, index),
      // The ones watched after it come back in order, ahead of what was queued.
      upNext: [...history.slice(index + 1), ...(video ? [video] : []), ...upNext],
      countdown: null,
    });
  },
  remove(index) {
    set({ upNext: get().upNext.filter((_, i) => i !== index) });
  },
  setUpNext(list) {
    set({ upNext: list });
  },
  fill(videos, size) {
    const { video, history, upNext } = get();
    if (upNext.length > size) {
      set({ upNext: upNext.slice(0, size) });
      return;
    }
    if (!video || !videos?.length || upNext.length === size) return;
    const seen = new Set([video.Id, ...history.map((v) => v.Id), ...upNext.map((v) => v.Id)]);
    const list = [...upNext];
    // Each pick follows the one before it: the same artist's videos first, then something new.
    let from = list[list.length - 1] ?? video;
    while (list.length < size) {
      const pick = nextVideo(from, videos, seen);
      if (!pick) break;
      list.push(pick);
      seen.add(pick.Id);
      from = pick;
    }
    set({ upNext: list });
  },
  stop() {
    set({ video: null, player: null, history: [], upNext: [], countdown: null });
  },
}));
