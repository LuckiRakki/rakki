// What the lyrics screen is showing right now: the visualizer instead of the lyrics, or the
// timing panel. Lyrics style (opened from the lyrics screen) switches them, since the lyrics
// screen itself keeps only the artwork, the song and the lyrics. Starts over each time the
// lyrics screen opens.
import { create } from 'zustand';

interface LyricsScreen {
  visualizer: boolean;
  timing: boolean;
  set(patch: Partial<Pick<LyricsScreen, 'visualizer' | 'timing'>>): void;
}

export const useLyricsScreen = create<LyricsScreen>((set) => ({
  visualizer: false,
  timing: false,
  set: (patch) => set(patch),
}));
