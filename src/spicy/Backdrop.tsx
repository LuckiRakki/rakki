import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useLyricsStyle } from '@/lyrics/style';
import { useTheme } from '@/ui/theme';
import { useBackgroundNow, useInBackground } from '@/lib/appActive';
import { SONG_FADE_MS } from '@/ui/FadeColor';
import { Kawarp, KAWARP_DIM } from '@/spicy/Kawarp';

/** How often Kawarp moves: the flow is slow, so 12 a second looks the same as 60 and redraws less. */
const MOVES_PER_SECOND = 12;

/**
 * Kawarp: the cover blurred and bent like liquid (src/spicy/Kawarp.tsx), moving on the UI thread
 * (which iOS pauses in the background) 12 times a second, and not at all while another screen
 * covers this one. `motion` scales the speed; 0 keeps it still. Also the Now Playing and music
 * video screens' Moving background. `fade` crossfades a new cover in over that many
 * milliseconds; `blur` scales how soft the colours are.
 */
export function FlowingCover({ uri, motion, fade, blur }: { uri?: string; motion: number; fade?: number; blur?: number }) {
  const clock = useSharedValue(0);
  const lastMove = useSharedValue(0);
  const focused = useIsFocused();
  const away = useInBackground();
  const hidden = useBackgroundNow();
  const running = motion > 0 && focused && !!uri && !hidden;

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

  // In the background the blurred cover lets go (the colour behind it stays).
  return uri && !away ? <Kawarp uri={uri} clock={clock} fade={fade} blur={blur} /> : null;
}

/**
 * The Spicy Lyrics backdrop: Kawarp, with a gentle brightness pulse and a dark tint for
 * readability. Blur (Lyrics Style) sets how soft Kawarp's colours are.
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
      <FlowingCover uri={uri} motion={still ? 0 : motion} fade={SONG_FADE_MS} blur={blur} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: KAWARP_DIM }]} />
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
