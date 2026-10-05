import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { tick } from '@/lib/haptics';
import { useVideoSession } from '@/video/session';

const SPRING = { damping: 22, stiffness: 240 };
const GAP = 24;

/**
 * The video on the video screen, with the one before and the one up next waiting just off
 * screen (as thumbnails): drag it sideways and they slide in; let go far (or fast) enough and
 * it goes there. Like swiping the cover on Now Playing.
 */
export function VideoCarousel(props: { video: BaseItem; width: number; height: number; radius: number; children: ReactNode }) {
  // A fresh row per video, so it starts centred on the new one (no flash of the old offset).
  return <Row key={props.video.Id} {...props} />;
}

function Row({ width, height, radius, children }: { width: number; height: number; radius: number; children: ReactNode }) {
  const client = useAuth((s) => s.client);
  const prev = useVideoSession((s) => s.history[s.history.length - 1]);
  const next = useVideoSession((s) => s.upNext[0]);
  const hasPrev = !!prev;
  const hasNext = !!next;
  const step = width + GAP;
  const x = useSharedValue(0);

  const go = (dir: 1 | -1) => {
    tick();
    if (dir > 0) useVideoSession.getState().next();
    else useVideoSession.getState().previous();
    // Still here (it didn't change): spring back.
    setTimeout(() => x.set(withSpring(0, SPRING)), 800);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      // Resist where there's nothing to slide in.
      const blocked = (e.translationX < 0 && !hasNext) || (e.translationX > 0 && !hasPrev);
      x.set(blocked ? e.translationX * 0.25 : e.translationX);
    })
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > width * 0.3 || Math.abs(e.velocityX) > 700;
      const dir = e.translationX < 0 ? 1 : -1;
      if (far && (dir > 0 ? hasNext : hasPrev)) {
        x.set(
          withTiming(-dir * step, { duration: 220 }, (done) => {
            if (done) runOnJS(go)(dir);
          }),
        );
      } else x.set(withSpring(0, SPRING));
    });

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const thumb = (item: BaseItem) => {
    const uri = client?.videoThumbUrl(item, 640);
    return (
      <View style={{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: '#000' }}>
        {uri ? <Image source={{ uri }} style={{ width, height }} contentFit="cover" /> : null}
      </View>
    );
  };

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ width, height }, row]}>
        {prev ? <View style={{ position: 'absolute', left: -step }}>{thumb(prev)}</View> : null}
        <View style={{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: '#000' }}>{children}</View>
        {next ? <View style={{ position: 'absolute', left: step }}>{thumb(next)}</View> : null}
      </Animated.View>
    </GestureDetector>
  );
}
