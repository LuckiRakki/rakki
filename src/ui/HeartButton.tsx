import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { tick } from '@/lib/haptics';
import { useTheme } from '@/ui/theme';

/** The like heart, with a little pop when you like something (not with reduced motion). */
export function HeartButton({ liked, onToggle, size = 28 }: { liked: boolean; onToggle: (liked: boolean) => void; size?: number }) {
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
          scale.set(withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 260 })));
        }
        onToggle(!liked);
      }}>
      <Animated.View style={style}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? t.colors.accent : t.colors.text} />
      </Animated.View>
    </Pressable>
  );
}
