import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOverlays } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles } from '@/ui/theme';

/** A short confirmation ("Added to Road trip") that fades in above the tab bar, then away. */
export function ToastHost() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useOverlays((s) => s.toast);
  const shown = useSharedValue(0);

  useEffect(() => {
    if (!toast) return;
    shown.value = withSequence(withTiming(1, { duration: 180 }), withDelay(1800, withTiming(0, { duration: 250 })));
  }, [toast, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 12 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 130 }, style]}>
      <T style={styles.text} numberOfLines={2}>
        {toast?.text ?? ''}
      </T>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '86%',
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md,
    borderRadius: t.radius.card,
    backgroundColor: '#fff',
    ...StyleSheet.flatten({ shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }),
  },
  text: { color: '#000', fontFamily: t.fonts.semibold, fontSize: t.size(14), textAlign: 'center' },
}));
