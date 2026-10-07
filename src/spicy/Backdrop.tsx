import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useLyricsStyle } from '@/lyrics/style';
import { useTheme } from '@/ui/theme';

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
      <Image source={{ uri }} blurRadius={60} style={{ width: side, height: side }} contentFit="cover" />
    </Animated.View>
  );
}

/** How often the layers move: the motion is slow (a turn takes a minute), so 12 a second looks
 * the same as 60, and each move makes the live blur on top redraw (the GPU's biggest job). */
const MOVES_PER_SECOND = 12;

/**
 * The cover, heavily blurred, as three slowly turning and drifting layers. Each blurred cover
 * is a static texture the GPU only moves around (on the UI thread, which iOS pauses in the
 * background), 12 times a second, and not at all while another screen covers this one.
 * `motion` scales the speed; 0 keeps it still. Put a live blur on top to melt the layers'
 * edges together. Also the Now Playing and music video screens' Moving background.
 */
export function FlowingCover({ uri, motion }: { uri?: string; motion: number }) {
  const clock = useSharedValue(0);
  const lastMove = useSharedValue(0);
  const focused = useIsFocused();
  const running = motion > 0 && focused && !!uri;

  // Seconds of motion so far (scaled by `motion`), advanced in steps.
  useFrameCallback((frame) => {
    'worklet';
    const dt = frame.timeSincePreviousFrame ?? 0;
    const since = lastMove.get() + dt;
    if (since < 1000 / MOVES_PER_SECOND) {
      lastMove.set(since);
      return;
    }
    lastMove.set(0);
    clock.set((clock.get() + (since / 1000) * motion) % 36000);
  }, running);

  useEffect(() => {
    if (motion <= 0) clock.set(0);
  }, [clock, motion]);

  return uri ? (
    <>
      {LAYERS.map((spec, i) => (
        <Layer key={i} uri={uri} spec={spec} clock={clock} />
      ))}
    </>
  ) : null;
}

/**
 * The Spicy Lyrics backdrop: the flowing cover, with a gentle brightness pulse and a dark tint
 * for readability; one live blur on top melts the layers so no shapes show, just flowing colour.
 */
export function SpicyBackdrop({ uri }: { uri?: string }) {
  const pulse = useSharedValue(0);
  // Reduced motion (or Movement at 0): the covers stay still and the glow doesn't pulse.
  const motion = useLyricsStyle((s) => s.backdropMotion);
  const blur = useLyricsStyle((s) => s.backdropBlur);
  const dim = useLyricsStyle((s) => s.backdropDim);
  const still = useTheme().reduceMotion || motion <= 0;

  useEffect(() => {
    if (still) {
      pulse.set(0.5);
      return;
    }
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 4500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 4500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, [pulse, still]);

  const breathe = useAnimatedStyle(() => ({ opacity: 0.12 * pulse.value }));

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0b0b0b', overflow: 'hidden' }]} pointerEvents="none">
      <FlowingCover uri={uri} motion={still ? 0 : motion} />
      <BlurView intensity={Math.round(100 * blur)} tint="dark" style={StyleSheet.absoluteFill} />
      {/* Brightness pulse, like the web mod's backdrop glow. */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, breathe]} />
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.35)']}
        style={StyleSheet.absoluteFill}
      />
      {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${0.6 * dim})` }]} /> : null}
    </View>
  );
}
