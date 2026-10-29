// How the visualizer and the moving backgrounds look (Settings → Visualizer, Backgrounds),
// kept on this computer. The visualizer's default is the owner's Feishin visualizer (a thin
// line graph with a faint mirror under it, audioMotion-analyzer's same settings), coloured by
// the accent, so it follows Lucid; Feishin's white and grey is one of the colour choices.
import { create } from 'zustand';
import { kv } from '~/lib/kv';

export type VisualizerStyle = 'line' | 'bars';
export type VisualizerColors = 'mono' | 'accent' | 'prism' | 'rainbow';

export interface VisualizerLook {
  style: VisualizerStyle;
  /** Bars: how many per octave (audioMotion's modes 1-8: 24 down to 1). */
  barsPerOctave: 24 | 12 | 6 | 3 | 1;
  colors: VisualizerColors;
  lineWidth: number;
  /** 0-1: the area under the line (or the bars' opacity). */
  fill: number;
  /** 0-0.5: how much of the height the mirror under it takes; 0 is none. */
  reflection: number;
  minFreq: number;
  maxFreq: number;
  /** 0-0.9: how much it smooths between frames. */
  smoothing: number;
  peaks: boolean;
}

export const FEISHIN: VisualizerLook = {
  style: 'line',
  barsPerOctave: 6,
  colors: 'accent',
  lineWidth: 1.9,
  fill: 0,
  reflection: 0.5,
  minFreq: 20,
  maxFreq: 22050,
  smoothing: 0.6,
  // One line: no peak marks falling behind it.
  peaks: false,
};

export const VISUALIZER_PRESETS: { id: string; label: string; look: VisualizerLook }[] = [
  { id: 'feishin', label: 'Line', look: FEISHIN },
  { id: 'area', label: 'Area', look: { ...FEISHIN, lineWidth: 2, fill: 0.35, reflection: 0, peaks: false } },
  { id: 'bars', label: 'Bars', look: { ...FEISHIN, style: 'bars', barsPerOctave: 6, colors: 'accent', fill: 1, reflection: 0.3, peaks: true } },
  { id: 'prism', label: 'Prism', look: { ...FEISHIN, style: 'bars', barsPerOctave: 12, colors: 'prism', fill: 1, reflection: 0.25, peaks: false } },
];

export type BackgroundMotion = 'lively' | 'calm' | 'still';

export interface BackgroundLook {
  /** The full player's and the video theater's background: moving, slow, or still. */
  motion: BackgroundMotion;
  /** Moves with the music (louder and on the beat: faster). */
  followMusic: boolean;
}

/** The full player's lyrics size, relative to the lyrics' column (so it fills any window alike); 1 is medium. */
export const LYRICS_SIZE = { min: 0.5, max: 2.5, default: 1.3 };

/** The whole app: its size (zoom), typeface, corners, spacing and motion. */
export interface AppLook {
  /** 0.8-1.5: everything bigger or smaller, like the browser's zoom. */
  size: number;
  font: 'inter' | 'system';
  corners: 'rounded' | 'soft' | 'square';
  density: 'comfortable' | 'compact';
  /** Fewer animations: pages and panels appear without moving, backgrounds hold still. */
  reduceMotion: boolean;
}

export const APP_LOOK: AppLook = { size: 1, font: 'inter', corners: 'rounded', density: 'comfortable', reduceMotion: false };

interface LookState {
  visualizer: VisualizerLook;
  background: BackgroundLook;
  lyricsSize: number;
  app: AppLook;
  setVisualizer(patch: Partial<VisualizerLook>): void;
  setBackground(patch: Partial<BackgroundLook>): void;
  setLyricsSize(size: number): void;
  setApp(patch: Partial<AppLook>): void;
}

const KEY = 'rakki.look';

function saved(): Pick<LookState, 'visualizer' | 'background' | 'lyricsSize' | 'app'> {
  const fallback = { visualizer: FEISHIN, background: { motion: 'lively' as const, followMusic: true }, lyricsSize: LYRICS_SIZE.default, app: APP_LOOK };
  try {
    const v = JSON.parse(kv.getItem(KEY) ?? '{}') as Partial<LookState> & { v?: number };
    const visualizer = { ...fallback.visualizer, ...v.visualizer };
    // Version 2: the line visualizer is one line (peak marks off).
    if ((v.v ?? 1) < 2) visualizer.peaks = false;
    return {
      visualizer,
      background: { ...fallback.background, ...v.background },
      lyricsSize: typeof v.lyricsSize === 'number' ? v.lyricsSize : fallback.lyricsSize,
      app: { ...fallback.app, ...v.app },
    };
  } catch {
    return fallback;
  }
}

export const useLook = create<LookState>((set, get) => {
  const save = () => {
    const { visualizer, background, lyricsSize, app } = get();
    try {
      kv.setItem(KEY, JSON.stringify({ v: 2, visualizer, background, lyricsSize, app }));
    } catch {
      // Kept for this session only.
    }
  };
  return {
    ...saved(),
    setVisualizer(patch) {
      set({ visualizer: { ...get().visualizer, ...patch } });
      save();
    },
    setBackground(patch) {
      set({ background: { ...get().background, ...patch } });
      save();
    },
    setLyricsSize(lyricsSize) {
      set({ lyricsSize });
      save();
    },
    setApp(patch) {
      set({ app: { ...get().app, ...patch } });
      save();
    },
  };
});

/** Which preset the look matches, if any. */
export function presetOf(look: VisualizerLook): string | null {
  const same = (a: VisualizerLook, b: VisualizerLook) => (Object.keys(a) as (keyof VisualizerLook)[]).every((k) => a[k] === b[k]);
  return VISUALIZER_PRESETS.find((p) => same(p.look, look))?.id ?? null;
}
