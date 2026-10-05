import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { useMusicVideos } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { tick } from '@/lib/haptics';
import { useScreenAwake } from '@/lib/keepAwake';
import { useSettings } from '@/settings/store';
import { FlowingCover } from '@/spicy/Backdrop';
import { ArtistLinks } from '@/ui/ArtistLinks';
import { Marquee } from '@/ui/Marquee';
import { openAlbum } from '@/ui/nav';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { inAppVideo, videoTitle } from '@/video/musicVideos';
import { useVideoSession } from '@/video/session';
import { VideoCarousel } from '@/video/VideoCarousel';
import { useVideoSong } from '@/video/videoSong';

// expo-video loads its native side when imported, so only builds that have it import it.
const VideoStage = inAppVideo ? lazy(() => import('@/video/VideoViews').then((m) => ({ default: m.VideoStage }))) : null;

/** How many of the queue show under the video (the rest: Queue). */
const UP_NEXT_ROWS = 3;

/**
 * The music video that's playing, with Rakki's own player, over the video's colours flowing
 * slowly behind it. Swiping down (or the chevron) tucks it into the mini-player, where it keeps
 * playing; swiping the video sideways goes through the queue. Full screen turns it sideways
 * across the whole screen, with the same controls. When it ends, the next in the queue follows
 * after a short countdown, unless Settings → Autoplay music videos is off.
 */
export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const client = useAuth((s) => s.client);
  const videos = useMusicVideos().data;
  const video = useVideoSession((s) => s.video);
  const [fullscreen, setFullscreen] = useState(false);
  const song = useVideoSong(video).data;
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

  const cardW = width - t.space.lg * 2;
  const stageW = fullscreen ? height : cardW;
  const stageH = fullscreen ? width : Math.round((cardW * 9) / 16);
  const stage = VideoStage ? (
    <Suspense fallback={<ActivityIndicator color="#fff" style={{ flex: 1 }} />}>
      <VideoStage width={stageW} height={stageH} fullscreen={fullscreen} onFullscreen={setFullscreen} />
    </Suspense>
  ) : (
    <ActivityIndicator color={t.colors.text} style={{ flex: 1 }} />
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

  const thumb = video ? client?.videoThumbUrl(video, 320) : undefined;
  const tint = artColor(video ? client?.blurhash(video) : undefined, '#1a1a1a');
  // The song's album (the video's own tags rarely have one), for the album link.
  const albumId = video?.AlbumId ?? song?.AlbumId;
  const album = video?.AlbumId ? video.Album : song?.Album;
  const artists = video?.ArtistItems?.length ? video.ArtistItems : song?.ArtistItems;

  return (
    <GestureDetector gesture={swipeDown}>
      <Animated.View style={[{ flex: 1, backgroundColor: t.tint(tint), overflow: 'hidden' }, follow]}>
        {/* The video's colours, flowing slowly (still with reduced motion). */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <FlowingCover uri={thumb} motion={t.reduceMotion ? 0 : t.appearance.playerMotion} />
          <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.7)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={[styles.header, { marginTop: insets.top }]}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Minimize">
            <Ionicons name="chevron-down" size={28} color={t.colors.text} />
          </Pressable>
          <T variant="label" color={t.colors.textSecondary} style={styles.headerLabel}>
            Music video
          </T>
          <Pressable hitSlop={10} onPress={() => router.push('/video-queue')} accessibilityLabel="Queue" style={{ marginRight: t.space.lg }}>
            <Ionicons name="list" size={24} color={t.colors.text} />
          </Pressable>
          <Pressable
            hitSlop={12}
            onPress={() => {
              tick();
              useVideoSession.getState().stop();
              router.back();
            }}
            accessibilityLabel="Stop the video">
            <Ionicons name="close" size={26} color={t.colors.text} />
          </Pressable>
        </View>

        <View style={[styles.card, { width: cardW, height: stageH }]}>
          {video ? (
            <VideoCarousel video={video} width={cardW} height={stageH} radius={t.radius.card}>
              {stage}
            </VideoCarousel>
          ) : (
            <ActivityIndicator color={t.colors.text} style={{ flex: 1 }} />
          )}
        </View>

        {video ? (
          <View style={{ paddingHorizontal: t.space.xl, marginTop: t.space.xl }}>
            <Marquee
              text={videoTitle(video.Name, video.Artists ?? []) || video.Name}
              style={{ fontFamily: t.fonts.bold, fontSize: t.size(24) }}
            />
            <ArtistLinks
              artists={artists}
              fallback={video.Artists?.join(', ')}
              variant="caption"
              numberOfLines={1}
              style={{ fontSize: t.size(16), marginTop: 2, color: t.colors.text }}
            />
            {album || video.ProductionYear ? (
              <T variant="caption" numberOfLines={1} style={{ fontSize: t.size(14), marginTop: 4 }}>
                {album && albumId ? (
                  <Text onPress={() => openAlbum(albumId)} suppressHighlighting style={{ textDecorationLine: 'underline' }}>
                    {album}
                  </Text>
                ) : (
                  (album ?? '')
                )}
                {album && video.ProductionYear ? ' · ' : ''}
                {video.ProductionYear ?? ''}
              </T>
            ) : null}
          </View>
        ) : null}

        <UpNext bottom={insets.bottom} />
      </Animated.View>
    </GestureDetector>
  );
}

/** The next few in the queue (with the countdown at the end), and the way to the whole queue. */
function UpNext({ bottom }: { bottom: number }) {
  const t = useTheme();
  const styles = useStyles();
  const upNext = useVideoSession((s) => s.upNext);
  const countdown = useVideoSession((s) => s.countdown);
  const autoplay = useSettings((s) => s.videoAutoplay);
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: t.space.lg, paddingBottom: bottom + t.space.md }}>
      <View style={styles.upNextHeader}>
        <T variant="heading" style={{ fontSize: t.size(17), flex: 1 }}>
          Up next
        </T>
        <Pressable
          onPress={() => router.push('/video-queue')}
          style={({ pressed }) => [styles.queueButton, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Open the queue">
          <Ionicons name="list" size={16} color={t.colors.text} />
          <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(13), marginLeft: 6 }}>Queue</T>
        </Pressable>
      </View>
      {upNext.length ? (
        upNext.slice(0, UP_NEXT_ROWS).map((item, i) => (
          <UpNextRow key={item.Id} item={item} index={i} countdown={i === 0 && autoplay ? countdown : null} />
        ))
      ) : (
        <T variant="caption" style={{ paddingVertical: t.space.md }}>
          Nothing else to play. Videos you start are added here.
        </T>
      )}
    </View>
  );
}

function UpNextRow({ item, index, countdown }: { item: BaseItem; index: number; countdown: number | null }) {
  const t = useTheme();
  const styles = useStyles();
  const client = useAuth((s) => s.client);
  const thumb = client?.videoThumbUrl(item, 240);
  const counting = countdown !== null;
  return (
    <Pressable
      onPress={() => {
        tick();
        useVideoSession.getState().skipTo(index);
      }}
      style={({ pressed }) => [styles.row, counting && styles.counting, pressed && { opacity: 0.7 }]}
      accessibilityLabel={`Play ${item.Name}`}>
      <View style={styles.thumb}>{thumb ? <Image source={{ uri: thumb }} style={{ flex: 1 }} contentFit="cover" /> : null}</View>
      <View style={{ flex: 1, marginHorizontal: t.space.md }}>
        {counting ? (
          <T variant="label" color={t.colors.accent} style={{ fontSize: t.size(10) }}>
            {`Up next in ${countdown}`}
          </T>
        ) : null}
        <T variant="bodyStrong" numberOfLines={1}>
          {videoTitle(item.Name, item.Artists ?? []) || item.Name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {item.Artists?.join(', ') ?? ''}
        </T>
      </View>
      {counting ? (
        <Pressable hitSlop={10} onPress={() => useVideoSession.setState({ countdown: null })} accessibilityLabel="Cancel autoplay">
          <Ionicons name="close" size={22} color={t.colors.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, height: 52 },
  headerLabel: { flex: 1, textAlign: 'center', fontSize: t.size(11), marginLeft: 40 },
  card: {
    alignSelf: 'center',
    marginTop: t.space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  upNextHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.sm },
  queueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: t.space.sm,
    marginHorizontal: -t.space.sm,
    borderRadius: t.radius.card,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  counting: { borderColor: t.colors.accent, backgroundColor: 'rgba(255,255,255,0.08)' },
  thumb: { width: 96, height: 54, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
}));
