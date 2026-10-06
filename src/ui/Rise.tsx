// The app's opening: after the launch screen, the app fades in and Home's panels rise into
// place one after another. Only while the app is opening (not every time Home comes back),
// and not with Reduce Motion. A panel whose songs are still loading waits, then rises when
// they arrive (instead of popping in), and the panels below glide down to make room.
import { useState, type ReactNode } from 'react';
import Animated, { Easing, FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { useTheme } from '@/ui/theme';

const launchedAt = Date.now();
const OPENING_MS = 2500;

const opening = () => Date.now() - launchedAt < OPENING_MS;

/**
 * A panel that rises into place during the opening; `order` staggers them top to bottom.
 * `ready`: it has something to show (a shelf's items have loaded); until then it takes no
 * space, and if it gets there after Home is up, it rises then.
 */
export function Rise({ order, ready = true, children }: { order: number; ready?: boolean; children: ReactNode }) {
  const t = useTheme();
  // Loaded already when Home appeared: on a later visit it's simply there.
  const [readyAtFirst] = useState(ready);
  if (!ready) return null;
  const late = !readyAtFirst;
  const animate = !t.reduceMotion && (late || opening());
  return (
    <Animated.View
      entering={
        animate
          ? FadeInDown.delay(late ? Math.min(order, 8) * 45 : 180 + order * 70)
              .duration(480)
              .easing(Easing.out(Easing.cubic))
          : undefined
      }
      layout={t.reduceMotion ? undefined : LinearTransition.duration(320).easing(Easing.out(Easing.cubic))}>
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
