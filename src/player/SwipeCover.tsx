import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import type { BaseItem } from '@/api/jellyfin';
import { tick } from '@/lib/haptics';
import { usePlayer } from '@/player/store';
import { Artwork } from '@/ui/Artwork';
import { useTheme } from '@/ui/theme';

const SPRING = { damping: 22, stiffness: 240 };

/**
 * The Now Playing cover, with the songs either side of it waiting just off screen: drag it
 * sideways and they slide in; let go far (or fast) enough and it skips there, like Apple
 * Music. Live radio just shows the cover.
 */
export function SwipeCover(props: { track: BaseItem; size: number; live: boolean; style?: StyleProp<ViewStyle> }) {
  // A fresh row per song, so it starts centred on the new one (no flash of the old offset).
  return <Row key={props.track.Id} {...props} />;
}

function Row({ track, size, live, style }: { track: BaseItem; size: number; live: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const prev = usePlayer((s) => s.queue[s.index - 1]?.item);
  const next = usePlayer((s) => s.queue[s.index + 1]?.item);
  const hasPrev = !!prev;
  const hasNext = !!next;
  const step = size + t.space.xl * 2;
  const x = useSharedValue(0);

  const skip = (dir: 1 | -1) => {
    tick();
    const p = usePlayer.getState();
    if (dir > 0) p.next();
    else p.skipTo(p.index - 1);
    // Still here (the skip didn't happen): spring back.
    setTimeout(() => x.set(withSpring(0, SPRING)), 800);
  };
  // First song: swiping right starts it over, like the back button.
  const restart = () => {
    tick();
    usePlayer.getState().previous();
  };

  const pan = Gesture.Pan()
    .enabled(!live)
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      // Resist where there's nothing to slide in.
      const blocked = (e.translationX < 0 && !hasNext) || (e.translationX > 0 && !hasPrev);
      x.set(blocked ? e.translationX * 0.25 : e.translationX);
    })
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > size * 0.3 || Math.abs(e.velocityX) > 700;
      const dir = e.translationX < 0 ? 1 : -1;
      if (far && (dir > 0 ? hasNext : hasPrev)) {
        x.set(
          withTiming(-dir * step, { duration: 220 }, (done) => {
            if (done) runOnJS(skip)(dir);
          }),
        );
        return;
      }
      if (far && dir < 0) runOnJS(restart)();
      x.set(withSpring(0, SPRING));
    });

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const middle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - Math.min(0.08, Math.abs(x.value) / (size * 6)) }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ width: size, height: size }, row]}>
        {prev && !live ? (
          <View style={{ position: 'absolute', left: -step }}>
            <Artwork item={prev} size={size} rounded={t.radius.card} />
          </View>
        ) : null}
        <Animated.View style={middle}>
          <Artwork item={track} size={size} rounded={t.radius.card} style={style} />
        </Animated.View>
        {next && !live ? (
          <View style={{ position: 'absolute', left: step }}>
            <Artwork item={next} size={size} rounded={t.radius.card} />
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
