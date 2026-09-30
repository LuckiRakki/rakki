import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { artistLine } from '@/lib/items';
import { usePlayer } from '@/player/store';
import { useProgress } from '@/player/useProgress';
import { Artwork } from '@/ui/Artwork';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/**
 * Spotify-style mini-player on top of the tab bar, tinted by the art colour.
 * Tap opens the full player; swipe left/right skips.
 */
export function MiniPlayer() {
  const t = useTheme();
  const styles = useStyles();
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const client = useAuth((s) => s.client);
  const { position, duration } = useProgress(500);

  if (!track) return null;
  const tint = artColor(client?.blurhash(track), t.colors.surface3);
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  const swipes = Gesture.Race(
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
    <View style={styles.wrap}>
      <GestureDetector gesture={swipes}>
        <Pressable style={[styles.card, { backgroundColor: tint }]} onPress={() => router.push('/player')}>
          <Artwork item={track} size={40} />
          <View style={styles.text}>
            <T numberOfLines={1} style={styles.title}>
              {track.Name}
            </T>
            <T variant="caption" numberOfLines={1} style={{ fontSize: t.size(12) }}>
              {artistLine(track)}
            </T>
          </View>
          <Pressable hitSlop={10} onPress={() => usePlayer.getState().toggle()} style={styles.btn}>
            {buffering ? (
              <ActivityIndicator color={t.colors.text} />
            ) : (
              <Ionicons name={playing ? 'pause' : 'play'} size={26} color={t.colors.text} />
            )}
          </Pressable>
          <Pressable hitSlop={10} onPress={() => usePlayer.getState().next()} style={styles.btn}>
            <Ionicons name="play-skip-forward" size={22} color={t.colors.text} />
          </Pressable>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
        </Pressable>
      </GestureDetector>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { paddingHorizontal: t.space.sm, paddingBottom: t.space.xs },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radius.card,
    overflow: 'hidden',
  },
  text: { flex: 1, marginHorizontal: 10 },
  title: { fontFamily: t.fonts.semibold, fontSize: t.size(13) },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: t.space.sm,
    right: t.space.sm,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  fill: { height: 2, borderRadius: 1, backgroundColor: t.colors.text },
}));
