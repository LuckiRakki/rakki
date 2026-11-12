// Album colours ease from one song to the next instead of jumping, like the desktop's background
// (Kawarp crossfades a new cover over 900 ms).
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** How long a new song's colour and cover take to fade in, as on the desktop. */
export const SONG_FADE_MS = 900;

/** A background colour that eases to `color` whenever it changes (on the UI thread). */
export function useFadedColor(color: string, ms = SONG_FADE_MS) {
  const shown = useSharedValue(color);
  useEffect(() => {
    shown.set(withTiming(color, { duration: ms, easing: Easing.inOut(Easing.quad) }));
  }, [shown, color, ms]);
  return useAnimatedStyle(() => ({ backgroundColor: shown.value }));
}

/** A view filled with `color`, easing to each new one. */
export function FadeColor({
  color,
  style,
  children,
  pointerEvents,
}: {
  color: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
}) {
  const fill = useFadedColor(color);
  return (
    <Animated.View pointerEvents={pointerEvents} style={[StyleSheet.absoluteFill, style, fill]}>
      {children}
    </Animated.View>
  );
}
