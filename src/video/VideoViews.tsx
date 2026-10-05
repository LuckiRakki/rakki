// What the music video player looks like: the big stage on the video screen (Rakki's own
// controls, which fade a few seconds after the last tap and come back with a tap, and its own
// full screen: the video turned sideways across the whole screen, with the same controls and a
// way out), and the small live video in the mini-player. Both show the one player VideoHost
// owns. Loaded lazily, only on builds with expo-video's native side.
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { router } from 'expo-router';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { tick } from '@/lib/haptics';
import { SeekBar } from '@/player/SeekBar';
import { Marquee } from '@/ui/Marquee';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { videoTitle } from '@/video/musicVideos';
import { useVideoSession } from '@/video/session';
import { getRoutePicker } from '../../modules/rakki-audio';

const HIDE_MS = 3000;
const RoutePicker = getRoutePicker();

const usePlayerOf = () => useVideoSession((s) => s.player) as VideoPlayer | null;

/** The big player: tap for controls. `fullscreen` lays it out sideways across the screen. */
export function VideoStage({
  width,
  height,
  fullscreen,
  onFullscreen,
}: {
  width: number;
  height: number;
  fullscreen: boolean;
  onFullscreen: (on: boolean) => void;
}) {
  const player = usePlayerOf();
  if (!player) {
    return (
      <View style={{ width, height, backgroundColor: '#000', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  return <Stage player={player} width={width} height={height} fullscreen={fullscreen} onFullscreen={onFullscreen} />;
}

function Stage({
  player,
  width,
  height,
  fullscreen,
  onFullscreen,
}: {
  player: VideoPlayer;
  width: number;
  height: number;
  fullscreen: boolean;
  onFullscreen: (on: boolean) => void;
}) {
  const view = useRef<VideoView>(null);
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  // Starting (or waiting for more of the video): a spinner where the play button goes.
  const loading = status === 'loading';
  const time = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const hasPrevious = useVideoSession((s) => s.history.length > 0);
  const hasNext = useVideoSession((s) => s.upNext.length > 0);
  const [shown, setShown] = useState(true);
  // Bumped by every control used, so the controls stay while you're using them.
  const [poke, setPoke] = useState(0);
  const touched = (fn: () => void) => () => {
    setPoke((n) => n + 1);
    fn();
  };

  // Controls fade out a few seconds after the last tap while the video plays.
  useEffect(() => {
    if (!shown || !isPlaying) return;
    const id = setTimeout(() => setShown(false), HIDE_MS);
    return () => clearTimeout(id);
  }, [shown, isPlaying, poke]);

  const toggle = () => (player.playing ? player.pause() : player.play());
  // Back: to the start first (after 3 s), then to the video before.
  const back = () => {
    if (player.currentTime > 3 || !hasPrevious) player.seekBy(-player.currentTime);
    else useVideoSession.getState().previous();
  };

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <VideoView ref={view} player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} allowsPictureInPicture />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setShown((s) => !s)} accessibilityLabel={shown ? 'Hide controls' : 'Show controls'}>
        {loading && !shown ? <ActivityIndicator size="large" color="#fff" style={StyleSheet.absoluteFill} /> : null}
        {shown ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(250)} style={[StyleSheet.absoluteFill, styles.scrim]}>
            <View style={[styles.top, fullscreen && { padding: 20 }]}>
              {RoutePicker ? <RoutePicker style={{ width: 28, height: 28 }} tintColor="#fff" activeTintColor="#fff" /> : null}
              <Pressable hitSlop={10} onPress={() => {
                  setPoke((n) => n + 1);
                  void view.current?.startPictureInPicture();
                }} accessibilityLabel="Picture in picture">
                <Ionicons name="albums-outline" size={22} color="#fff" />
              </Pressable>
              <Pressable
                hitSlop={12}
                onPress={() => {
                  tick();
                  onFullscreen(!fullscreen);
                }}
                accessibilityLabel={fullscreen ? 'Exit full screen' : 'Full screen'}>
                <Ionicons name={fullscreen ? 'contract' : 'expand'} size={24} color="#fff" />
              </Pressable>
            </View>
            <View style={[styles.center, fullscreen && { gap: 48 }]}>
              <Pressable hitSlop={10} onPress={touched(back)} accessibilityLabel="Previous video">
                <Ionicons name="play-skip-back" size={24} color="#fff" />
              </Pressable>
              <Pressable hitSlop={10} onPress={touched(() => player.seekBy(-10))} accessibilityLabel="Back 10 seconds">
                <Ionicons name="play-back" size={28} color="#fff" />
              </Pressable>
              {loading ? (
                <View style={styles.loading} accessibilityLabel="Loading">
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              ) : (
                <Pressable onPress={touched(toggle)} style={styles.play} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#000" style={{ marginLeft: isPlaying ? 0 : 4 }} />
                </Pressable>
              )}
              <Pressable hitSlop={10} onPress={touched(() => player.seekBy(10))} accessibilityLabel="Forward 10 seconds">
                <Ionicons name="play-forward" size={28} color="#fff" />
              </Pressable>
              <Pressable
                hitSlop={10}
                disabled={!hasNext}
                onPress={touched(() => useVideoSession.getState().next())}
                accessibilityLabel="Next video"
                style={{ opacity: hasNext ? 1 : 0.35 }}>
                <Ionicons name="play-skip-forward" size={24} color="#fff" />
              </Pressable>
            </View>
            <View style={[styles.bottom, fullscreen && { paddingHorizontal: 32, paddingBottom: 16 }]}>
              <SeekBar
                position={time.currentTime}
                duration={player.duration || 0}
                onSeek={(s) => {
                  setPoke((n) => n + 1);
                  player.seekBy(s - player.currentTime);
                }}
              />
            </View>
          </Animated.View>
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * The mini-player while a video plays: the live video (or nothing until it starts), title,
 * play/pause, stop. Tap or swipe up to open it.
 */
export function VideoMini({ live }: { live: boolean }) {
  const t = useTheme();
  const s = useMiniStyles();
  const video = useVideoSession((st) => st.video);
  const player = usePlayerOf();
  // Swipe up opens the video again; left and right go through the queue (like the song one).
  const swipes = Gesture.Race(
    Gesture.Fling()
      .direction(Directions.UP)
      .runOnJS(true)
      .onStart(() => router.push('/video')),
    Gesture.Fling()
      .direction(Directions.LEFT)
      .runOnJS(true)
      .onStart(() => useVideoSession.getState().next()),
    Gesture.Fling()
      .direction(Directions.RIGHT)
      .runOnJS(true)
      .onStart(() => useVideoSession.getState().previous()),
  );
  if (!video) return null;
  return (
    <Animated.View entering={t.reduceMotion ? undefined : FadeInDown.duration(260)} style={s.wrap}>
      <GestureDetector gesture={swipes}>
        <Pressable style={[s.card, { backgroundColor: t.colors.surface2 }]} onPress={() => router.push('/video')} accessibilityLabel="Open the video">
          <View style={s.thumb}>
            {player && live ? (
              <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
            ) : null}
          </View>
          <View style={s.text}>
            <Marquee text={videoTitle(video.Name, video.Artists ?? []) || video.Name} style={s.title} />
            <T variant="caption" numberOfLines={1} style={{ fontSize: t.size(12) }}>
              {video.Artists?.join(', ') || 'Music video'}
            </T>
          </View>
          {player ? <MiniPlayPause player={player} /> : <ActivityIndicator color={t.colors.text} style={s.btn} />}
          <Pressable
            hitSlop={10}
            onPress={() => {
              tick();
              useVideoSession.getState().stop();
            }}
            style={s.btn}
            accessibilityLabel="Stop the video">
            <Ionicons name="close" size={24} color={t.colors.text} />
          </Pressable>
        </Pressable>
      </GestureDetector>
    </Animated.View>
  );
}

function MiniPlayPause({ player }: { player: VideoPlayer }) {
  const t = useTheme();
  const s = useMiniStyles();
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  if (status === 'loading') return <ActivityIndicator color={t.colors.text} style={s.btn} accessibilityLabel="Loading" />;
  return (
    <Pressable
      hitSlop={10}
      onPress={() => {
        tick();
        if (player.playing) player.pause();
        else player.play();
      }}
      style={s.btn}
      accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
      <Ionicons name={isPlaying ? 'pause' : 'play'} size={26} color={t.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 22, padding: 12 },
  center: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  play: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  loading: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: 14, paddingBottom: 4 },
});

const useMiniStyles = makeStyles((t) => ({
  wrap: { paddingHorizontal: t.space.sm, paddingBottom: t.space.xs },
  card: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: t.space.sm, borderRadius: t.radius.card, overflow: 'hidden' },
  thumb: { width: 71, height: 40, borderRadius: 6, overflow: 'hidden', backgroundColor: '#000' },
  text: { flex: 1, marginHorizontal: 10 },
  title: { fontFamily: t.fonts.semibold, fontSize: t.size(13) },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
}));
