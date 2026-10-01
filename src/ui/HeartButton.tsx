import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { tick } from '@/lib/haptics';
import { useTheme } from '@/ui/theme';

/**
 * The like heart: one small bounce when you like something (not with reduced motion). Hold it
 * for `onLongPress` (the player uses it for Add to playlist).
 */
export function HeartButton({
  liked,
  onToggle,
  onLongPress,
  size = 28,
}: {
  liked: boolean;
  onToggle: (liked: boolean) => void;
  onLongPress?: () => void;
  size?: number;
}) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      hitSlop={10}
      accessibilityLabel={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      onPress={() => {
        tick();
        if (!liked && !t.reduceMotion) {
          scale.set(
            withSequence(
              withTiming(1.2, { duration: 120, easing: Easing.out(Easing.quad) }),
              withTiming(1, { duration: 160, easing: Easing.inOut(Easing.quad) }),
            ),
          );
        }
        onToggle(!liked);
      }}
      onLongPress={onLongPress}
      delayLongPress={350}>
      <Animated.View style={style}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? t.colors.accent : t.colors.text} />
      </Animated.View>
    </Pressable>
  );
}
