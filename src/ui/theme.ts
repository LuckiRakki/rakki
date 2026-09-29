// Design tokens (docs/FRAMEWORK.md §5). Dark only, Spotify/Feishin-style.
export const colors = {
  bg: '#121212',
  surface: '#181818',
  surface2: '#242424',
  surface3: '#2A2A2A',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.70)',
  textMuted: 'rgba(255,255,255,0.50)',
  border: 'rgba(255,255,255,0.10)',
  /** Rakki's own accent: a "spicy" orange (fallback when there's no art colour). */
  accent: '#FF6B3D',
  danger: '#FF5470',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { art: 4, card: 8, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_800ExtraBold',
} as const;
