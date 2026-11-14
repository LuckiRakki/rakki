// How the big visualizer looks (Settings → Look → Visualizer): the lyrics screen's, the sideways
// player's and the player's card for songs without lyrics. The default is the desktop's (Feishin's
// thin line with a faint mirror under it, coloured by the accent), with the same presets and
// values as desktop/src/settings/look.ts, so both apps look alike out of the box.

export type VisualizerStyle = 'line' | 'bars';
export type VisualizerColors = 'mono' | 'accent' | 'prism' | 'rainbow';

export interface VisualizerLook {
  style: VisualizerStyle;
  /** Bars: how many across (the phone hears 32 bands, low to high). */
  bars: 12 | 20 | 32;
  colors: VisualizerColors;
  lineWidth: number;
  /** 0-1: the area under the line (or the bars' opacity). */
  fill: number;
  /** 0-0.5: how much of the height the mirror under it takes; 0 is none. */
  reflection: number;
  /** 0-0.9: how much it smooths between frames. */
  smoothing: number;
  /** Marks that hold the highest points for a moment. */
  peaks: boolean;
}

/** The desktop's default (its FEISHIN look). */
export const DESKTOP_LINE: VisualizerLook = {
  style: 'line',
  bars: 20,
  colors: 'accent',
  lineWidth: 1.9,
  fill: 0,
  reflection: 0.5,
  smoothing: 0.6,
  peaks: false,
};

export const VISUALIZER_PRESETS: { id: string; label: string; look: VisualizerLook }[] = [
  { id: 'line', label: 'Line', look: DESKTOP_LINE },
  { id: 'area', label: 'Area', look: { ...DESKTOP_LINE, lineWidth: 2, fill: 0.35, reflection: 0 } },
  { id: 'bars', label: 'Bars', look: { ...DESKTOP_LINE, style: 'bars', bars: 20, fill: 1, reflection: 0.3, peaks: true } },
  { id: 'prism', label: 'Prism', look: { ...DESKTOP_LINE, style: 'bars', bars: 32, colors: 'prism', fill: 1, reflection: 0.25 } },
];

/** The preset `look` matches exactly, or null (the user's own). */
export function presetOf(look: VisualizerLook): string | null {
  const keys = Object.keys(DESKTOP_LINE) as (keyof VisualizerLook)[];
  return VISUALIZER_PRESETS.find((p) => keys.every((k) => p.look[k] === look[k]))?.id ?? null;
}

const STYLES: VisualizerStyle[] = ['line', 'bars'];
const COLORS: VisualizerColors[] = ['mono', 'accent', 'prism', 'rainbow'];
const BARS = [12, 20, 32] as const;
const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** A saved (or imported) look with anything missing or out of range back to the default. */
export function normalizeVisualizer(input: unknown): VisualizerLook {
  const v = (input && typeof input === 'object' ? input : {}) as Partial<VisualizerLook>;
  const d = DESKTOP_LINE;
  return {
    style: STYLES.includes(v.style as VisualizerStyle) ? (v.style as VisualizerStyle) : d.style,
    bars: BARS.includes(v.bars as (typeof BARS)[number]) ? (v.bars as VisualizerLook['bars']) : d.bars,
    colors: COLORS.includes(v.colors as VisualizerColors) ? (v.colors as VisualizerColors) : d.colors,
    lineWidth: clamp(v.lineWidth, 0.5, 4, d.lineWidth),
    fill: clamp(v.fill, 0, 1, d.fill),
    reflection: clamp(v.reflection, 0, 0.5, d.reflection),
    smoothing: clamp(v.smoothing, 0, 0.9, d.smoothing),
    peaks: typeof v.peaks === 'boolean' ? v.peaks : d.peaks,
  };
}
