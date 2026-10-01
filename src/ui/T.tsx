import { Text, type TextProps } from 'react-native';

import { makeStyles } from '@/ui/theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label';

/** Themed text. `variant` picks the type style; `color` overrides the colour. */
export function T({
  variant = 'body',
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  const styles = useStyles();
  return <Text {...rest} style={[styles[variant], color ? { color } : null, style]} />;
}

const useStyles = makeStyles((t) => ({
  display: { fontFamily: t.fonts.display, fontSize: t.size(28), color: t.colors.text, letterSpacing: -0.6 },
  title: { fontFamily: t.fonts.title, fontSize: t.size(24), color: t.colors.text, letterSpacing: -0.4 },
  heading: { fontFamily: t.fonts.bold, fontSize: t.size(20), color: t.colors.text, letterSpacing: -0.3 },
  body: { fontFamily: t.fonts.regular, fontSize: t.size(15), color: t.colors.text },
  bodyStrong: { fontFamily: t.fonts.semibold, fontSize: t.size(15), color: t.colors.text },
  caption: { fontFamily: t.fonts.regular, fontSize: t.size(13), color: t.colors.textSecondary },
  label: {
    fontFamily: t.fonts.semibold,
    fontSize: t.size(11),
    color: t.colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
}));
