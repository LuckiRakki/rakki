import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { artistLine } from '@/lib/items';
import { usePlayer } from '@/player/store';
import { openAlbum } from '@/ui/AlbumTile';
import { Artwork } from '@/ui/Artwork';
import { T } from '@/ui/T';
import { colors, fonts, radius, space } from '@/ui/theme';

/** Spotify-style mini-player that sits on top of the tab bar, tinted by the art colour. */
export function MiniPlayer() {
  const track = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const client = useAuth((s) => s.client);

  if (!track) return null;
  const tint = artColor(client?.blurhash(track), colors.surface3);
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.card, { backgroundColor: tint }]}
        onPress={() => track.AlbumId && openAlbum(track.AlbumId)}>
        <Artwork item={track} size={40} />
        <View style={styles.text}>
          <T numberOfLines={1} style={styles.title}>
            {track.Name}
          </T>
          <T variant="caption" numberOfLines={1} style={{ fontSize: 12 }}>
            {artistLine(track)}
          </T>
        </View>
        <Pressable hitSlop={10} onPress={() => usePlayer.getState().toggle()} style={styles.btn}>
          {buffering && !playing ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Ionicons name={playing ? 'pause' : 'play'} size={26} color={colors.text} />
          )}
        </Pressable>
        <Pressable hitSlop={10} onPress={() => usePlayer.getState().next()} style={styles.btn}>
          <Ionicons name="play-skip-forward" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.sm, paddingBottom: space.xs },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: space.sm,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  text: { flex: 1, marginHorizontal: 10 },
  title: { fontFamily: fonts.semibold, fontSize: 13 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  fill: { height: 2, borderRadius: 1, backgroundColor: colors.text },
});
