// Rakki 2.0's glass panel. It follows Settings > Look > Glass: Frost (smoked glass), Tint (glass coloured by the
// album) or Clear (no panel at all; the screen lays a dark fade under its controls instead).
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/ui/theme';

export function Glass({
  children,
  radius,
  style,
  /** 'well' is the quieter, unblurred panel (the lyrics card under the player's sheet). */
  variant = 'panel',
  /** Draw Frost even when the setting is Clear (the mini player and tab bar must stay readable over lists). */
  solid,
}: {
  children?: ReactNode;
  radius: number;
  style?: StyleProp<ViewStyle>;
  variant?: 'panel' | 'well';
  solid?: boolean;
}) {
  const t = useTheme();
  const g = t.glass.kind === 'clear' && solid ? { ...t.glass, fill: 'rgba(18,18,22,0.42)', blur: 40, line: 'rgba(255,255,255,0.14)' } : t.glass;
  if (variant === 'well') {
    return <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: g.well }, style]}>{children}</View>;
  }
  if (g.blur === 0) return <View style={[{ borderRadius: radius }, style]}>{children}</View>;
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: g.line }, style]}>
      <BlurView intensity={g.blur} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: g.fill }]} />
      {children}
    </View>
  );
}
