import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOverlays } from '@/ui/overlays';
import { T } from '@/ui/T';
import { TopLayer } from '@/ui/TopLayer';
import { makeStyles } from '@/ui/theme';

const IN_MS = 180;
const HOLD_MS = 1800;
const OUT_MS = 250;

/**
 * A short confirmation ("Added to Road trip") that fades in above the tab bar, then away.
 * It sits in a TopLayer so it also shows over the full player; the layer is only mounted
 * while a toast is up.
 */
export function ToastHost() {
  const toast = useOverlays((s) => s.toast);
  const [doneId, setDoneId] = useState<number | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setDoneId(toast.id), IN_MS + HOLD_MS + OUT_MS + 50);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast || doneId === toast.id) return null;
  return (
    <TopLayer>
      <ToastView key={toast.id} text={toast.text} />
    </TopLayer>
  );
}

function ToastView({ text }: { text: string }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const shown = useSharedValue(0);

  useEffect(() => {
    shown.set(withSequence(withTiming(1, { duration: IN_MS }), withDelay(HOLD_MS, withTiming(0, { duration: OUT_MS }))));
  }, [shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * 12 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 130 }, style]}>
      <T style={styles.text} numberOfLines={2}>
        {text}
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
