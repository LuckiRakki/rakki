// The in-app music video player (expo-video) with Rakki's own controls instead of Apple's:
// tap the video to show them (they hide again while it plays): play/pause, 10 s back and
// forward, a scrubber, picture in picture and full screen. Loaded lazily from the video
// screen, and only on builds that have expo-video's native side.
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { SeekBar } from '@/player/SeekBar';
import { newPlaySessionId } from '@/video/musicVideos';
import { getRoutePicker } from '../../modules/rakki-audio';

const HIDE_MS = 3000;
const RoutePicker = getRoutePicker();

export default function VideoPlayer({ video, onEnded }: { video: BaseItem; onEnded?: () => void }) {
  const client = useAuth((s) => s.client);
  const { width } = useWindowDimensions();
  const height = Math.round((width * 9) / 16);
  // One session per video: the screen keys this player by the video's id.
  const session = useMemo(() => newPlaySessionId(), []);
  const uri = useMemo(() => client?.videoStreamUrl(video, session) ?? null, [client, video, session]);
  const view = useRef<VideoView>(null);
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.play();
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const time = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const [shown, setShown] = useState(true);

  // The song's end hands over to the screen (autoplay).
  const ended = useRef(onEnded);
  useEffect(() => {
    ended.current = onEnded;
  });
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      setShown(true);
      ended.current?.();
    });
    return () => sub.remove();
  }, [player]);

  // Controls hide on their own while the video plays.
  useEffect(() => {
    if (!shown || !isPlaying) return;
    const id = setTimeout(() => setShown(false), HIDE_MS);
    return () => clearTimeout(id);
  }, [shown, isPlaying, time.currentTime]);

  // Closing the screen (or moving to the next video) ends the server's conversion.
  useEffect(() => () => void client?.stopVideoEncoding(session).catch(() => {}), [client, session]);

  const toggle = () => (player.playing ? player.pause() : player.play());

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <VideoView
        ref={view}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        // The app is portrait-only; full screen turns the video sideways.
        fullscreenOptions={{ enable: true, orientation: 'landscape' }}
        allowsPictureInPicture
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setShown((s) => !s)} accessibilityLabel={shown ? 'Hide controls' : 'Show controls'}>
        {status === 'loading' ? <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} /> : null}
        {shown ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(250)} style={[StyleSheet.absoluteFill, styles.scrim]}>
            <View style={styles.top}>
              {RoutePicker ? <RoutePicker style={{ width: 28, height: 28 }} tintColor="#fff" activeTintColor="#fff" /> : null}
              <Pressable hitSlop={10} onPress={() => void view.current?.startPictureInPicture()} accessibilityLabel="Picture in picture">
                <Ionicons name="albums-outline" size={22} color="#fff" />
              </Pressable>
              <Pressable hitSlop={10} onPress={() => void view.current?.enterFullscreen()} accessibilityLabel="Full screen">
                <Ionicons name="expand" size={22} color="#fff" />
              </Pressable>
            </View>
            <View style={styles.center}>
              <Pressable hitSlop={12} onPress={() => player.seekBy(-10)} accessibilityLabel="Back 10 seconds">
                <Ionicons name="play-back" size={30} color="#fff" />
              </Pressable>
              <Pressable onPress={toggle} style={styles.play} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={34} color="#000" style={{ marginLeft: isPlaying ? 0 : 4 }} />
              </Pressable>
              <Pressable hitSlop={12} onPress={() => player.seekBy(10)} accessibilityLabel="Forward 10 seconds">
                <Ionicons name="play-forward" size={30} color="#fff" />
              </Pressable>
            </View>
            <View style={styles.bottom}>
              <SeekBar
                position={time.currentTime}
                duration={player.duration || 0}
                onSeek={(s) => player.seekBy(s - player.currentTime)}
              />
            </View>
          </Animated.View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 22, padding: 12 },
  center: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 44 },
  play: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: 14, paddingBottom: 4 },
});
