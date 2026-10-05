// The music video that's playing. Its player lives at the app's root (VideoHost), not in the
// video screen, so swiping the screen down keeps the video going in the mini-player; the
// screen and the mini-player both show that one player. No expo-video import here: older
// builds without it load this file too.
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';

interface VideoSession {
  video: BaseItem | null;
  /** expo-video's player for `video` (set by VideoHost; null while it starts). */
  player: unknown;
  /** What plays after it (autoplay), picked when it starts. */
  next: BaseItem | null;
  /** Seconds left of the "Up next" countdown at the end; null when not counting. */
  countdown: number | null;
  /** Videos watched since the first one (autoplay doesn't repeat them). */
  watched: string[];
  play(video: BaseItem): void;
  stop(): void;
}

export const useVideoSession = create<VideoSession>((set, get) => ({
  video: null,
  player: null,
  next: null,
  countdown: null,
  watched: [],
  play(video) {
    const watched = get().video ? [...get().watched, video.Id] : [video.Id];
    set({ video, watched, next: null, countdown: null });
  },
  stop() {
    set({ video: null, player: null, next: null, countdown: null, watched: [] });
  },
}));
