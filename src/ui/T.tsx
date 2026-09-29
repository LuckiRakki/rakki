import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '@/ui/theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label';

/** Themed text. `variant` picks the type style; `color` overrides the colour. */
export function T({
  variant = 'body',
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...rest} style={[styles[variant], color ? { color } : null, style]} />;
}

const styles = StyleSheet.create({
  display: { fontFamily: fonts.black, fontSize: 28, color: colors.text, letterSpacing: -0.6 },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.text, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  caption: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
