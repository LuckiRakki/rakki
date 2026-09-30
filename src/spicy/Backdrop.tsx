import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/**
 * The Spicy Lyrics backdrop: the album art, heavily blurred, slowly turning behind the
 * lyrics, under a dark tint for readability. The blurred image is one static texture, so
 * spinning it costs the GPU almost nothing.
 */
export function SpicyBackdrop({ uri, secondsPerTurn = 90 }: { uri?: string; secondsPerTurn?: number }) {
  const { width, height } = useWindowDimensions();
  const side = Math.hypot(width, height) * 1.15; // big enough to cover every corner while turning
  const turn = useSharedValue(0);

  useEffect(() => {
    turn.value = withRepeat(withTiming(360, { duration: secondsPerTurn * 1000, easing: Easing.linear }), -1, false);
  }, [turn, secondsPerTurn]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0b0b0b', overflow: 'hidden' }]} pointerEvents="none">
      {uri ? (
        <Animated.View
          style={[
            { position: 'absolute', width: side, height: side, left: (width - side) / 2, top: (height - side) / 2 },
            spin,
          ]}>
          <Image source={{ uri }} blurRadius={70} style={{ width: side, height: side, opacity: 0.85 }} contentFit="cover" />
        </Animated.View>
      ) : null}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.6)']}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
