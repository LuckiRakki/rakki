import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMusicVideos } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { useScreenAwake } from '@/lib/keepAwake';
import { useSettings } from '@/settings/store';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { inAppVideo } from '@/video/musicVideos';
import { useVideoSession } from '@/video/session';

// expo-video loads its native side when imported, so only builds that have it import it.
const VideoStage = inAppVideo ? lazy(() => import('@/video/VideoViews').then((m) => ({ default: m.VideoStage }))) : null;

/**
 * The music video that's playing, with Rakki's own player. Swiping down (or the chevron) tucks
 * it into the mini-player, where it keeps playing. Full screen turns it sideways across the
 * whole screen, with the same controls. When it ends, another one by the same artist (or
 * anything else not watched yet) follows after a short countdown, unless Settings → Autoplay
 * music videos is off.
 */
export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const client = useAuth((s) => s.client);
  const videos = useMusicVideos().data;
  const autoplay = useSettings((s) => s.videoAutoplay);
  const video = useVideoSession((s) => s.video);
  const next = useVideoSession((s) => s.next);
  const countdown = useVideoSession((s) => s.countdown);
  const [fullscreen, setFullscreen] = useState(false);
  useScreenAwake('video');

  // Opened from a link with nothing playing yet: start that video.
  useEffect(() => {
    if (useVideoSession.getState().video || !id) return;
    const linked = videos?.find((v) => v.Id === id);
    if (linked) useVideoSession.getState().play(linked);
  }, [id, videos]);

  // Swipe down: the screen follows the finger, then tucks away (or springs back).
  const drag = useSharedValue(0);
  const swipeDown = Gesture.Pan()
    .enabled(!fullscreen)
    .activeOffsetY(24)
    .failOffsetX([-16, 16])
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 800) {
        drag.set(withTiming(height, { duration: 180 }));
        router.back();
      } else drag.set(withSpring(0, { damping: 20, stiffness: 220 }));
    })
    .runOnJS(true);
  const follow = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.value }],
    borderRadius: drag.value > 0 ? 24 : 0,
  }));

  const stageW = fullscreen ? height : width;
  const stageH = fullscreen ? width : Math.round((width * 9) / 16);
  const stage = VideoStage ? (
    <Suspense fallback={<ActivityIndicator color="#fff" />}>
      <VideoStage width={stageW} height={stageH} fullscreen={fullscreen} onFullscreen={setFullscreen} />
    </Suspense>
  ) : (
    <ActivityIndicator color={t.colors.text} />
  );

  // Full screen: the stage turned a quarter, filling the (portrait) screen.
  if (fullscreen) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar hidden />
        <View
          style={{
            position: 'absolute',
            width: stageW,
            height: stageH,
            left: (width - stageW) / 2,
            top: (height - stageH) / 2,
            transform: [{ rotate: '90deg' }],
          }}>
          {stage}
        </View>
      </View>
    );
  }

  return (
    <GestureDetector gesture={swipeDown}>
      <Animated.View style={[{ flex: 1, backgroundColor: '#000', paddingTop: insets.top, overflow: 'hidden' }, follow]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, height: 48 }}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Minimize">
            <Ionicons name="chevron-down" size={28} color={t.colors.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {video ? (
            <Pressable
              hitSlop={12}
              onPress={() => {
                useVideoSession.getState().stop();
                router.back();
              }}
              accessibilityLabel="Stop the video">
              <Ionicons name="close" size={26} color={t.colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {video ? stage : <ActivityIndicator color={t.colors.text} />}
          {video ? (
            <View style={{ paddingHorizontal: t.space.xl, marginTop: t.space.xl }}>
              <T numberOfLines={2} style={{ fontFamily: t.fonts.bold, fontSize: t.size(22) }}>
                {video.Name}
              </T>
              <T variant="caption" numberOfLines={1} style={{ fontSize: t.size(16), marginTop: 2 }}>
                {[video.Artists?.join(', '), video.ProductionYear].filter(Boolean).join(' · ')}
              </T>
            </View>
          ) : null}

          {autoplay && next ? (
            <View style={[styles.next, countdown !== null && { borderColor: t.colors.accent }]}>
              <View style={styles.thumb}>
                {client?.videoThumbUrl(next, 240) ? (
                  <Image source={{ uri: client.videoThumbUrl(next, 240) }} style={{ flex: 1 }} contentFit="cover" />
                ) : null}
              </View>
              <View style={{ flex: 1, marginHorizontal: t.space.md }}>
                <T variant="label" color={countdown !== null ? t.colors.accent : t.colors.textSecondary} style={{ fontSize: t.size(10) }}>
                  {countdown !== null ? `Up next in ${countdown}` : 'Up next'}
                </T>
                <T variant="bodyStrong" numberOfLines={1}>
                  {next.Name}
                </T>
                <T variant="caption" numberOfLines={1}>
                  {next.Artists?.join(', ') ?? ''}
                </T>
              </View>
              {countdown !== null ? (
                <Pressable hitSlop={10} onPress={() => useVideoSession.setState({ countdown: null })} accessibilityLabel="Cancel autoplay">
                  <Ionicons name="close" size={24} color={t.colors.textSecondary} />
                </Pressable>
              ) : null}
              <Pressable
                hitSlop={10}
                onPress={() => useVideoSession.getState().play(next)}
                accessibilityLabel="Play it now"
                style={{ marginLeft: t.space.md }}>
                <Ionicons name="play-skip-forward" size={24} color={t.colors.text} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const useStyles = makeStyles((t) => ({
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: t.space.lg,
    marginTop: t.space.xl,
    padding: t.space.sm,
    borderRadius: t.radius.card,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  thumb: { width: 96, height: 54, borderRadius: 6, overflow: 'hidden', backgroundColor: t.colors.surface2 },
}));
