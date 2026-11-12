// Design tokens (docs/FRAMEWORK.md §5), built from the user's appearance settings.
//
// Components never import fixed colours, sizes or fonts: they read the current theme with
// `useTheme()` and build their styles with `makeStyles((t) => ({ … }))`, so every screen
// follows the Customize screen live.
import { createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';

import { FONTS } from '@/appearance/fonts';
import { APPEARANCE_DEFAULTS, type Appearance } from '@/appearance/store';
import type { ThemeColors } from '@/appearance/themes';
import { mix, withAlpha } from '@/lib/color';

const DENSITY = { compact: 0.8, comfortable: 1, spacious: 1.2 } as const;

/** Surface steps above the background (0–255 towards white), before the contrast setting. */
const STEPS = { dark: [9, 19, 29], oled: [14, 26, 34] } as const;

/**
 * Rakki 2.0's glass. Frost is smoked glass, Tint is glass coloured by the album, Clear has no panel (screens
 * lay a dark fade under their controls instead). `fill` sits over a BlurView of `blur` intensity.
 */
function glassTokens(kind: Appearance['glass'], accent: string) {
  if (kind === 'clear') return { kind, fill: 'transparent', blur: 0, line: 'transparent', well: 'rgba(18,18,22,0.42)' };
  if (kind === 'tint') {
    const deep = mix('#000000', accent, 0.3);
    return { kind, fill: withAlpha(deep, 0.62), blur: 40, line: 'rgba(255,255,255,0.16)', well: withAlpha(mix('#000000', accent, 0.2), 0.62) };
  }
  return { kind, fill: 'rgba(18,18,22,0.42)', blur: 40, line: 'rgba(255,255,255,0.14)', well: 'rgba(0,0,0,0.34)' };
}

export function buildTheme(a: Appearance, env: { systemReduceMotion?: boolean; theme?: ThemeColors | null } = {}) {
  const d = DENSITY[a.density];
  const file = env.theme ?? {};
  // A theme file's corners replace Rakki's (its --radius is the card corner).
  const r = file.radius !== undefined ? file.radius / 8 : Math.max(0, a.roundness);
  const base = file.bg ?? (a.background === 'oled' ? '#000000' : '#0B0B0D');
  const bg = a.background === 'tinted' && !file.bg ? mix(base, a.accent, 0.07) : base;
  const steps = STEPS[a.background === 'oled' ? 'oled' : 'dark'];
  const surface = (i: number) => mix(bg, '#ffffff', (steps[i] * a.surfaceContrast) / 255);
  const faces = FONTS[a.font]?.faces ?? FONTS.figtree.faces;
  const heavy = a.titleWeight === 'heavy';
  return {
    appearance: a,
    colors: {
      bg,
      surface: file.surface ?? surface(0),
      surface2: file.surface2 ?? surface(1),
      surface3: file.surface3 ?? surface(2),
      text: file.text ?? '#FFFFFF',
      textSecondary: file.textSecondary ?? 'rgba(255,255,255,0.80)',
      textMuted: file.textMuted ?? 'rgba(255,255,255,0.70)',
      border: file.border ?? 'rgba(255,255,255,0.10)',
      /** Rakki's accent (a "spicy" orange by default, or Lucid's album colour). */
      accent: a.accent,
      /** The accent as text: lifted toward white so it stays readable on glass whatever the cover is. */
      accentText: mix(a.accent, '#FFFFFF', 0.24),
      /** Ink on top of an accent fill (the pause circle). */
      onAccent: '#141008',
      /** Rows and wells on the 2.0 screens (Settings, History and Stats). */
      row: 'rgba(255,255,255,0.06)',
      danger: '#FF5470',
    },
    glass: glassTokens(a.glass, a.accent),
    space: {
      xs: Math.round(4 * d),
      sm: Math.round(8 * d),
      md: Math.round(12 * d),
      lg: Math.round(16 * d),
      xl: Math.round(24 * d),
      xxl: Math.round(32 * d),
    },
    radius: { art: 4 * r, card: 8 * r, pill: 999 },
    fonts: {
      ...faces,
      /** Page titles ("Good evening", "Your Library"). */
      display: heavy ? faces.black : faces.bold,
      /** Album / playlist / screen titles. */
      title: heavy ? faces.bold : faces.semibold,
    },
    /** A font size scaled by the user's text size setting. */
    size: (n: number) => Math.round(n * a.textScale * 10) / 10,
    /** An album-art colour toned by the "art tint" setting (0 = plain background). */
    tint: (color: string) => mix(bg, color, a.artTint),
    /** Skip or shorten animations (the setting, or iOS Reduce Motion when set to follow it). */
    reduceMotion: a.motion === 'reduced' || (a.motion === 'system' && !!env.systemReduceMotion),
  };
}

export type Theme = ReturnType<typeof buildTheme>;

export const DEFAULT_THEME = buildTheme(APPEARANCE_DEFAULTS);

export const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Styles that depend on the theme. Returns a hook; styles are built once per theme and
 * cached, so re-renders don't recreate them.
 */
export function makeStyles<S extends StyleSheet.NamedStyles<S>>(factory: (t: Theme) => S) {
  const cache = new WeakMap<Theme, S>();
  return function useStyles(): S {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}
