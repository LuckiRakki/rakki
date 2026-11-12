import { Ionicons } from '@/ui/Icon';
import { router, usePathname } from 'expo-router';
import { lazy, Suspense } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useInBackground } from '@/lib/appActive';
import { tick } from '@/lib/haptics';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { artistLine } from '@/lib/items';
import { useRemoteProgress, useRemoteTarget } from '@/player/remoteTarget';
import { usePlayer } from '@/player/store';
import type { RakkiDevice } from '@/remote/devices';
import { useProgress } from '@/player/useProgress';
import { Artwork } from '@/ui/Artwork';
import { Marquee } from '@/ui/Marquee';
import { Glass } from '@/ui/Glass';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { Visualizer } from '@/ui/Visualizer';
import { inAppVideo } from '@/video/musicVideos';
import { useVideoSession } from '@/video/session';

// While a music video plays, the mini-player shows it instead (expo-video builds only).
const VideoMini = inAppVideo ? lazy(() => import('@/video/VideoViews').then((m) => ({ default: m.VideoMini }))) : null;

/**
 * Spotify-style mini-player on top of the tab bar, tinted by the art colour.
 * Tap (or swipe up) opens the full player; swipe left/right skips. While a music video plays,
 * it's the video instead (live, unless the video screen itself is open).
 */
export function MiniPlayer() {
  const t = useTheme();
  const styles = useStyles();
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const client = useAuth((s) => s.client);
  const { position, duration } = useProgress(500);
  const video = useVideoSession((s) => s.video);
  const pathname = usePathname();
  const target = useRemoteTarget((s) => s.target);
  const away = useInBackground();

  if (target) return <RemoteMini target={target} />;
  if (video && VideoMini) {
    return (
      <Suspense fallback={null}>
        <VideoMini live={pathname !== '/video'} />
      </Suspense>
    );
  }
  if (!track) return null;
  const { miniPlayer: style, miniProgress, miniVisualizer } = t.appearance;
  // Tinted: the art's colour (toned by Art tint). Solid: a plain surface. Glass: frosted blur.
  const background =
    style === 'tinted' ? t.tint(artColor(client?.blurhash(track), t.colors.surface3)) : style === 'solid' ? t.colors.surface2 : 'transparent';
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  const swipes = Gesture.Race(
    Gesture.Fling()
      .direction(Directions.UP)
      .runOnJS(true)
      .onStart(() => router.push('/player')),
    Gesture.Fling()
      .direction(Directions.LEFT)
      .runOnJS(true)
      .onStart(() => usePlayer.getState().next()),
    Gesture.Fling()
      .direction(Directions.RIGHT)
      .runOnJS(true)
      .onStart(() => {
        const { index, skipTo, previous } = usePlayer.getState();
        if (index > 0) skipTo(index - 1);
        else previous();
      }),
  );

  return (
    // Slides up into place when music starts (not with reduced motion).
    <Animated.View entering={t.reduceMotion ? undefined : FadeInDown.duration(260)} style={styles.wrap}>
      <GestureDetector gesture={swipes}>
        <Pressable style={[styles.card, { backgroundColor: background }]} onPress={() => router.push('/player')}>
          {style === 'glass' && !away ? <Glass radius={22} solid style={StyleSheet.absoluteFill} /> : null}
          <Artwork item={track} size={44} rounded={10} />
          <View style={styles.text}>
            <Marquee text={track.Name} style={styles.title} />
            <T numberOfLines={1} style={styles.artist}>
              {artistLine(track)}
            </T>
          </View>
          {miniVisualizer ? (
            <View style={styles.viz}>
              <Visualizer bars={4} width={16} height={14} color={t.colors.text} />
            </View>
          ) : null}
          <Pressable
            hitSlop={10}
            onPress={() => {
              tick();
              usePlayer.getState().toggle();
            }}
            style={styles.btn}>
            {buffering ? (
              <ActivityIndicator color={t.colors.text} />
            ) : (
              <Ionicons name={playing ? (track.Radio ? 'stop' : 'pause') : 'play'} size={playing && track.Radio ? 22 : 26} color={t.colors.text} />
            )}
          </Pressable>
          {track.Radio ? null : (
            <Pressable
              hitSlop={10}
              onPress={() => {
                tick();
                usePlayer.getState().next();
              }}
              style={styles.btn}>
              <Ionicons name="play-skip-forward" size={22} color={t.colors.text} />
            </Pressable>
          )}
          {miniProgress ? (
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
          ) : null}
        </Pressable>
      </GestureDetector>
    </Animated.View>
  );
}

/**
 * While this phone controls another Rakki: that device's song, "Listening on {device}" in the
 * accent colour, and buttons that command it. Tap opens the player (also the device's).
 */
function RemoteMini({ target }: { target: RakkiDevice }) {
  const t = useTheme();
  const styles = useStyles();
  const client = useAuth((s) => s.client);
  const { position, duration } = useRemoteProgress(500);
  const item = target.item;
  const r = useRemoteTarget.getState;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const glass = t.appearance.miniPlayer === 'glass';
  const background = glass ? 'transparent' : item ? t.tint(artColor(client?.blurhash(item), t.colors.surface3)) : t.colors.surface2;
  const swipes = Gesture.Race(
    Gesture.Fling()
      .direction(Directions.UP)
      .runOnJS(true)
      .onStart(() => router.push('/player')),
    Gesture.Fling()
      .direction(Directions.LEFT)
      .runOnJS(true)
      .onStart(() => r().command('NextTrack')),
    Gesture.Fling()
      .direction(Directions.RIGHT)
      .runOnJS(true)
      .onStart(() => r().command('PreviousTrack')),
  );
  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={swipes}>
        <Pressable style={[styles.card, { backgroundColor: background }]} onPress={() => router.push(item ? '/player' : '/devices')}>
          {glass ? <Glass radius={22} solid style={StyleSheet.absoluteFill} /> : null}
          {item ? <Artwork item={item} size={44} rounded={10} /> : <Ionicons name="laptop-outline" size={26} color={t.colors.text} style={{ width: 40, textAlign: 'center' }} />}
          <View style={styles.text}>
            <Marquee text={item?.Name ?? 'Nothing playing'} style={styles.title} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="laptop-outline" size={12} color={t.colors.accentText} />
              <T numberOfLines={1} style={{ fontFamily: t.fonts.semibold, fontSize: t.size(13), color: t.colors.accentText, flexShrink: 1 }}>
                {`Listening on ${target.name}`}
              </T>
            </View>
          </View>
          {item ? (
            <>
              <Pressable
                hitSlop={10}
                accessibilityLabel={target.paused ? `Play on ${target.name}` : `Pause on ${target.name}`}
                onPress={() => {
                  tick();
                  r().command('PlayPause');
                }}
                style={styles.btn}>
                <Ionicons name={target.paused ? 'play' : 'pause'} size={26} color={t.colors.text} />
              </Pressable>
              <Pressable
                hitSlop={10}
                accessibilityLabel={`Next on ${target.name}`}
                onPress={() => {
                  tick();
                  r().command('NextTrack');
                }}
                style={styles.btn}>
                <Ionicons name="play-skip-forward" size={22} color={t.colors.text} />
              </Pressable>
            </>
          ) : null}
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
        </Pressable>
      </GestureDetector>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // 2.0: a floating glass card, 12 in from the edges, over the pill tab bar.
  wrap: { paddingHorizontal: 12, paddingBottom: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 22,
    overflow: 'hidden',
  },
  text: { flex: 1, marginHorizontal: 12 },
  title: { fontFamily: t.fonts.bold, fontSize: t.size(15) },
  artist: { fontFamily: t.fonts.semibold, fontSize: t.size(13), color: t.colors.accentText, marginTop: 1 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  viz: { marginRight: 6, opacity: 0.85 },
  track: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 0,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  fill: { height: 3, backgroundColor: t.colors.text },
}));
