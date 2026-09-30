import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * A layer of the backdrop: one blurred copy of the cover, turning at its own speed and
 * drifting around its own small orbit. Several of these at different sizes, speeds and
 * directions give the slowly flowing colour blobs of Spicy Lyrics / Apple Music.
 */
interface LayerSpec {
  /** Size relative to the screen diagonal. */
  scale: number;
  /** Where its centre sits, as fractions of the screen. */
  cx: number;
  cy: number;
  /** Seconds per full turn; negative turns the other way. */
  turn: number;
  /** Orbit radius (fraction of the screen width) and seconds per orbit. */
  orbit: number;
  orbitSec: number;
  opacity: number;
}

const LAYERS: LayerSpec[] = [
  { scale: 1.25, cx: 0.5, cy: 0.5, turn: 70, orbit: 0, orbitSec: 1, opacity: 1 },
  { scale: 0.9, cx: 0.2, cy: 0.25, turn: -46, orbit: 0.12, orbitSec: 38, opacity: 0.75 },
  { scale: 0.8, cx: 0.8, cy: 0.75, turn: 34, orbit: 0.14, orbitSec: 29, opacity: 0.7 },
];

function Layer({ uri, spec, clock }: { uri: string; spec: LayerSpec; clock: SharedValue<number> }) {
  const { width, height } = useWindowDimensions();
  const side = Math.hypot(width, height) * spec.scale;

  const style = useAnimatedStyle(() => {
    const t = clock.value; // seconds
    const angle = ((t / spec.turn) * 360) % 360;
    const phase = (t / spec.orbitSec) * 2 * Math.PI;
    const r = spec.orbit * width;
    return {
      transform: [
        { translateX: Math.cos(phase) * r },
        { translateY: Math.sin(phase) * r },
        { rotate: `${angle}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: side,
          height: side,
          left: width * spec.cx - side / 2,
          top: height * spec.cy - side / 2,
          opacity: spec.opacity,
        },
        style,
      ]}>
      <Image source={{ uri }} blurRadius={60} style={{ width: side, height: side, borderRadius: side / 2 }} contentFit="cover" />
    </Animated.View>
  );
}

/**
 * The Spicy Lyrics backdrop: the cover, heavily blurred, as three slowly turning and drifting
 * layers, with a gentle brightness pulse and a dark tint for readability. Each blurred cover
 * is a static texture that the GPU only moves around, so this stays cheap.
 */
export function SpicyBackdrop({ uri }: { uri?: string }) {
  const clock = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    // One long linear clock (1 h) drives every layer; each derives its own motion from it.
    clock.value = withRepeat(withTiming(3600, { duration: 3600 * 1000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 4500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [clock, pulse]);

  const breathe = useAnimatedStyle(() => ({ opacity: 0.12 * pulse.value }));

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0b0b0b', overflow: 'hidden' }]} pointerEvents="none">
      {uri ? LAYERS.map((spec, i) => <Layer key={i} uri={uri} spec={spec} clock={clock} />) : null}
      {/* Brightness pulse, like the web mod's backdrop glow. */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, breathe]} />
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.5)']}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
