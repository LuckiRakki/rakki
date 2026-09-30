// Design tokens (docs/FRAMEWORK.md §5), built from the user's appearance settings.
//
// Components never import fixed colours or sizes: they read the current theme with
// `useTheme()` and build their styles with `makeStyles((t) => ({ … }))`, so every screen
// follows the Customize screen live. Font families stay constant (Inter) for now.
import { createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';

import { APPEARANCE_DEFAULTS, type Appearance } from '@/appearance/store';

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_800ExtraBold',
} as const;

const DENSITY = { compact: 0.8, comfortable: 1, spacious: 1.2 } as const;

export function buildTheme(a: Appearance) {
  const d = DENSITY[a.density];
  const r = Math.max(0, a.roundness);
  const oled = a.background === 'oled';
  return {
    appearance: a,
    colors: {
      bg: oled ? '#000000' : '#121212',
      surface: oled ? '#0e0e0e' : '#181818',
      surface2: oled ? '#1a1a1a' : '#242424',
      surface3: oled ? '#222222' : '#2A2A2A',
      text: '#FFFFFF',
      textSecondary: 'rgba(255,255,255,0.70)',
      textMuted: 'rgba(255,255,255,0.50)',
      border: 'rgba(255,255,255,0.10)',
      /** Rakki's accent (a "spicy" orange by default); album screens may use the art colour instead. */
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
    fonts,
    /** A font size scaled by the user's text size setting. */
    size: (n: number) => Math.round(n * a.textScale * 10) / 10,
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
