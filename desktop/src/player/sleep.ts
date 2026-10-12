// Sleep timer: pause after a while, or at the end of the song that's playing.
import { create } from 'zustand';

import { currentPosition, usePlayer } from '~/player/store';

interface SleepState {
  /** When it pauses (Date.now() ms), or null. */
  endsAt: number | null;
  endOfSong: boolean;
  set(minutes: number | 'song' | null): void;
}

let timer: ReturnType<typeof setInterval> | null = null;

export const useSleep = create<SleepState>((set, get) => ({
  endsAt: null,
  endOfSong: false,
  set(minutes) {
    if (timer) clearInterval(timer);
    timer = null;
    if (minutes === null) return set({ endsAt: null, endOfSong: false });
    if (minutes === 'song') {
      const p = usePlayer.getState();
      set({ endOfSong: true, endsAt: Date.now() + Math.max(0, p.duration - currentPosition(p)) * 1000 });
    } else {
      set({ endOfSong: false, endsAt: Date.now() + minutes * 60_000 });
    }
    timer = setInterval(() => {
      const { endsAt, endOfSong } = get();
      if (!endsAt) return;
      if (endOfSong) {
        // Follows the song (a seek moves the end).
        const p = usePlayer.getState();
        const left = p.duration - currentPosition(p);
        if (left > 0.6) return set({ endsAt: Date.now() + left * 1000 });
      } else if (Date.now() < endsAt) return;
      if (usePlayer.getState().playing) usePlayer.getState().toggle();
      get().set(null);
    }, 500);
  },
}));
