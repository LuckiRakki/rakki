// How the visualizer and the moving backgrounds look (Settings → Visualizer, Backgrounds),
// kept on this computer. The visualizer's default is the owner's Feishin visualizer: a thin
// white-to-grey line graph with a faint mirror under it (audioMotion-analyzer, same settings).
import { create } from 'zustand';

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
  colors: 'mono',
  lineWidth: 1.9,
  fill: 0,
  reflection: 0.5,
  minFreq: 20,
  maxFreq: 22050,
  smoothing: 0.6,
  peaks: true,
};

export const VISUALIZER_PRESETS: { id: string; label: string; look: VisualizerLook }[] = [
  { id: 'feishin', label: 'Line', look: FEISHIN },
  { id: 'area', label: 'Area', look: { ...FEISHIN, colors: 'accent', lineWidth: 2, fill: 0.35, reflection: 0, peaks: false } },
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

interface LookState {
  visualizer: VisualizerLook;
  background: BackgroundLook;
  setVisualizer(patch: Partial<VisualizerLook>): void;
  setBackground(patch: Partial<BackgroundLook>): void;
}

const KEY = 'rakki.look';

function saved(): Pick<LookState, 'visualizer' | 'background'> {
  const fallback = { visualizer: FEISHIN, background: { motion: 'lively' as const, followMusic: true } };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<LookState>;
    return { visualizer: { ...fallback.visualizer, ...v.visualizer }, background: { ...fallback.background, ...v.background } };
  } catch {
    return fallback;
  }
}

export const useLook = create<LookState>((set, get) => {
  const save = () => {
    const { visualizer, background } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ visualizer, background }));
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
  };
});

/** Which preset the look matches, if any. */
export function presetOf(look: VisualizerLook): string | null {
  const same = (a: VisualizerLook, b: VisualizerLook) => (Object.keys(a) as (keyof VisualizerLook)[]).every((k) => a[k] === b[k]);
  return VISUALIZER_PRESETS.find((p) => same(p.look, look))?.id ?? null;
}
