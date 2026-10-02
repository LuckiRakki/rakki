// The app's opening: after the launch screen, the app fades in and Home's panels rise into
// place one after another. Only while the app is opening (not every time Home comes back),
// and not with Reduce Motion.
import type { ReactNode } from 'react';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '@/ui/theme';

const launchedAt = Date.now();
const OPENING_MS = 2500;

const opening = () => Date.now() - launchedAt < OPENING_MS;

/** A panel that rises into place during the opening; `order` staggers them top to bottom. */
export function Rise({ order, children }: { order: number; children: ReactNode }) {
  const t = useTheme();
  const animate = opening() && !t.reduceMotion;
  return (
    <Animated.View
      entering={
        animate
          ? FadeInDown.delay(180 + order * 70)
              .duration(480)
              .easing(Easing.out(Easing.cubic))
          : undefined
      }>
      {children}
    </Animated.View>
  );
}

/** The whole app fading in from the launch screen. */
export function OpeningFade({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Animated.View style={{ flex: 1 }} entering={t.reduceMotion ? undefined : FadeIn.duration(420)}>
      {children}
    </Animated.View>
  );
}
