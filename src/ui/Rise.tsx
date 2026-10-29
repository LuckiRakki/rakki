// The app's opening: after the launch screen, the app fades in. (Home's parts then arrive in
// order on their own: ui/Reveal.tsx.) Not with Reduce Motion.
import type { ReactNode } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/ui/theme';

/** The whole app fading in from the launch screen. */
export function OpeningFade({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Animated.View style={{ flex: 1 }} entering={t.reduceMotion ? undefined : FadeIn.duration(420)}>
      {children}
    </Animated.View>
  );
}
