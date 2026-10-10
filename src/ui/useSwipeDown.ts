// Swipe down to close, for screens that cover the whole app (lyrics, music video): the screen
// follows the finger and goes on a long or fast pull, or springs back. Sheets (the player,
// queue, settings) get the same from iOS itself.
import { router } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const SPRING = { damping: 20, stiffness: 220 };

/**
 * `pan()` makes a gesture for one area (call it once per GestureDetector); `style` goes on the
 * screen's outer Animated.View.
 */
export function useSwipeDown(enabled = true) {
  const { height } = useWindowDimensions();
  const drag = useSharedValue(0);
  const pan = () =>
    Gesture.Pan()
      .enabled(enabled)
      .activeOffsetY(20)
      .failOffsetX([-16, 16])
      .onUpdate((e) => {
        drag.set(Math.max(0, e.translationY));
      })
      .onEnd((e) => {
        if (e.translationY > 80 || e.velocityY > 800) {
          drag.set(withTiming(height, { duration: 180 }));
          router.back();
        } else drag.set(withSpring(0, SPRING));
      })
      .runOnJS(true);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.value }],
    borderRadius: drag.value > 0 ? 24 : 0,
    overflow: 'hidden',
  }));
  return { pan, style };
}
