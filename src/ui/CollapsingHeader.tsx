// Spotify's album/playlist header feel: as the page scrolls, the cover shrinks, fades and
// drifts up, and a title bar in the page's colour fades in at the top once the title has
// scrolled under it. Scroll-driven (it follows your finger), so it stays on with reduced motion.
import { View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/** The page's scroll position, for the cover and the title bar. */
export function useScrollY() {
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  return { y, onScroll };
}

/** The cover's style: shrinks and fades as you scroll down, grows a little when you pull down. */
export function useCoverStyle(y: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, 260], [1, 0.2], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(y.value, [0, 260], [0, 70], Extrapolation.CLAMP) },
      { scale: interpolate(y.value, [-150, 0, 260], [1.1, 1, 0.78], Extrapolation.CLAMP) },
    ],
  }));
}

/**
 * A bar with the page title that fades in once the scroll passes `showAt` (where the big
 * title goes under it). Sits under the back / "..." buttons.
 */
export function StickyTitleBar({
  y,
  title,
  color,
  showAt = 270,
}: {
  y: SharedValue<number>;
  title: string;
  color: string;
  showAt?: number;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const style = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [showAt - 50, showAt], [0, 1], Extrapolation.CLAMP) }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + t.space.sm + 36 + t.space.sm,
          paddingTop: insets.top + t.space.sm,
          paddingHorizontal: 64,
          backgroundColor: color,
          justifyContent: 'center',
        },
        style,
      ]}>
      <View style={{ height: 36, justifyContent: 'center' }}>
        <T numberOfLines={1} style={{ fontFamily: t.fonts.bold, fontSize: t.size(16), textAlign: 'center' }}>
          {title}
        </T>
      </View>
    </Animated.View>
  );
}
