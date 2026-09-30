import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles } from '@/ui/theme';

const OPEN_MS = 260;

/**
 * A Spotify-style bottom sheet: slides up over a dimmed backdrop; tap the backdrop or drag the
 * sheet down to close. Stays mounted until its closing animation has finished.
 */
export function Sheet({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.85,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxHeightRatio?: number;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const offset = useSharedValue(height); // sheet translateY: 0 = open
  const drag = useSharedValue(0);

  // Opening mounts straight away; closing unmounts after the slide-out finishes.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      drag.set(0);
      offset.set(withTiming(0, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }));
    } else if (mounted) {
      offset.set(
        withTiming(height, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) runOnJS(setMounted)(false);
        }),
      );
    }
  }, [visible, mounted, height, offset, drag]);

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .onChange((e) => {
      drag.set(Math.max(0, drag.get() + e.changeY));
    })
    .onEnd((e) => {
      if (drag.get() > 110 || e.velocityY > 900) {
        runOnJS(onClose)();
      } else {
        drag.set(withTiming(0, { duration: 180 }));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() + drag.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - Math.min(1, offset.get() / height)) }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { maxHeight: height * maxHeightRatio, paddingBottom: insets.bottom + 8 }, sheetStyle]}>
          <GestureDetector gesture={pan}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  backdrop: { backgroundColor: '#000' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.colors.surface2,
    borderTopLeftRadius: 12 * Math.max(0.5, t.appearance.roundness),
    borderTopRightRadius: 12 * Math.max(0.5, t.appearance.roundness),
    overflow: 'hidden',
  },
  handleArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
}));
