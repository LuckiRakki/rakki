// Customize → Presets, and the setting groups each section's Reset restores.
import { APPEARANCE_DEFAULTS, type Appearance } from '@/appearance/store';

export const SECTIONS = {
  colour: ['accentMode', 'accent', 'background', 'surfaceContrast', 'artTint'],
  type: ['font', 'textScale', 'titleWeight'],
  shape: ['roundness', 'density', 'gridColumns'],
  home: ['homeOrder', 'homeHidden', 'quickPicks', 'greeting'],
  mini: ['miniPlayer', 'miniProgress', 'tabLabels'],
  player: ['playerBackground', 'lyricsCard'],
  feel: ['haptics', 'motion'],
} satisfies Record<string, (keyof Appearance)[]>;

export type SectionId = keyof typeof SECTIONS;

/** A section's defaults (its Reset). */
export function sectionDefaults(section: SectionId): Partial<Appearance> {
  const out: Record<string, unknown> = {};
  for (const k of SECTIONS[section]) out[k] = APPEARANCE_DEFAULTS[k];
  return out as Partial<Appearance>;
}

/** Everything a preset sets: the look (colour, type, shape, mini-player, now playing). */
const LOOK: SectionId[] = ['colour', 'type', 'shape', 'mini', 'player'];
const lookDefaults = (): Partial<Appearance> => Object.assign({}, ...LOOK.map(sectionDefaults));

export const PRESETS: { id: string; label: string; swatch: string; values: Partial<Appearance> }[] = [
  { id: 'rakki', label: 'Rakki', swatch: APPEARANCE_DEFAULTS.accent, values: {} },
  {
    id: 'spotify',
    label: 'Spotify-like',
    swatch: '#1ED760',
    values: { accent: '#1ED760', font: 'figtree', roundness: 1, miniPlayer: 'tinted', playerBackground: 'gradient' },
  },
  {
    id: 'apple',
    label: 'Apple Music-like',
    swatch: '#FA2D48',
    values: {
      accent: '#FA2D48',
      background: 'oled',
      surfaceContrast: 1.2,
      artTint: 0.8,
      roundness: 1.6,
      miniPlayer: 'glass',
      playerBackground: 'blur',
    },
  },
  {
    id: 'oled',
    label: 'OLED black',
    swatch: '#000000',
    values: { background: 'oled', surfaceContrast: 0.8, artTint: 0.5, miniPlayer: 'solid', playerBackground: 'solid' },
  },
  {
    id: 'bold',
    label: 'Big & bold',
    swatch: '#FFD23F',
    values: { accent: '#FFD23F', textScale: 1.25, density: 'spacious', roundness: 1.4, titleWeight: 'heavy' },
  },
];

/** A preset's full look (it fills every look setting, then you can tweak). */
export function presetValues(id: string): Partial<Appearance> {
  const preset = PRESETS.find((p) => p.id === id);
  return { ...lookDefaults(), ...(preset?.values ?? {}) };
}

/** Accent swatches offered under Custom. */
export const SWATCHES = [
  '#FF6B3D',
  '#FF3B5C',
  '#FA2D48',
  '#FF8FB1',
  '#C86BFA',
  '#7C5CFF',
  '#4C8DFF',
  '#2EC5FF',
  '#1ED760',
  '#7BE07B',
  '#FFD23F',
  '#FFFFFF',
];
