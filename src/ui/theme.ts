// Design tokens (docs/FRAMEWORK.md §5), built from the user's appearance settings.
//
// Components never import fixed colours, sizes or fonts: they read the current theme with
// `useTheme()` and build their styles with `makeStyles((t) => ({ … }))`, so every screen
// follows the Customize screen live.
import { createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';

import { FONTS } from '@/appearance/fonts';
import { APPEARANCE_DEFAULTS, type Appearance } from '@/appearance/store';
import { mix } from '@/lib/color';

const DENSITY = { compact: 0.8, comfortable: 1, spacious: 1.2 } as const;

/** Surface steps above the background (0–255 towards white), before the contrast setting. */
const STEPS = { dark: [6, 18, 24], oled: [14, 26, 34] } as const;

export function buildTheme(a: Appearance, env: { systemReduceMotion?: boolean } = {}) {
  const d = DENSITY[a.density];
  const r = Math.max(0, a.roundness);
  const base = a.background === 'oled' ? '#000000' : '#121212';
  const bg = a.background === 'tinted' ? mix(base, a.accent, 0.07) : base;
  const steps = STEPS[a.background === 'oled' ? 'oled' : 'dark'];
  const surface = (i: number) => mix(bg, '#ffffff', (steps[i] * a.surfaceContrast) / 255);
  const faces = FONTS[a.font]?.faces ?? FONTS.inter.faces;
  const heavy = a.titleWeight === 'heavy';
  return {
    appearance: a,
    colors: {
      bg,
      surface: surface(0),
      surface2: surface(1),
      surface3: surface(2),
      text: '#FFFFFF',
      textSecondary: 'rgba(255,255,255,0.70)',
      textMuted: 'rgba(255,255,255,0.50)',
      border: 'rgba(255,255,255,0.10)',
      /** Rakki's accent (a "spicy" orange by default, or Lucid's album colour). */
      accent: a.accent,
      danger: '#FF5470',
    },
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
