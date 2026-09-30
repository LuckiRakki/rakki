import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRoutePicker } from '../../modules/rakki-audio';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { artistLine } from '@/lib/items';
import { showTrackActions } from '@/player/actions';
import { SeekBar } from '@/player/SeekBar';
import { usePlayer } from '@/player/store';
import { useProgress } from '@/player/useProgress';
import { Artwork } from '@/ui/Artwork';
import { T } from '@/ui/T';
import { colors, fonts, radius, space } from '@/ui/theme';

const RoutePicker = getRoutePicker();

function tap(fn: () => void) {
  return () => {
    void Haptics.selectionAsync().catch(() => {});
    fn();
  };
}

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const client = useAuth((s) => s.client);
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const source = usePlayer((s) => s.source);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const error = usePlayer((s) => s.error);
  const { position, duration } = useProgress(250);

  if (!track) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <T variant="caption">Nothing playing</T>
      </View>
    );
  }

  const tint = artColor(client?.blurhash(track));
  const art = Math.min(width - space.xl * 2, 420);
  const favorite = track.UserData?.IsFavorite ?? false;
  const p = usePlayer.getState;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[tint, '#101010']} locations={[0, 0.85]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.md, paddingHorizontal: space.xl }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <Ionicons name="chevron-down" size={28} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', marginHorizontal: space.md }}>
            <T variant="label" color={colors.textSecondary} style={{ fontSize: 10 }}>
              {source ? `Playing from ${source.type === 'tracks' ? 'your selection' : source.type}` : 'Now playing'}
            </T>
            <T numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 13 }}>
              {source?.name ?? track.Album ?? ''}
            </T>
          </View>
          <Pressable hitSlop={12} onPress={() => showTrackActions(track)}>
            <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Artwork */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Artwork item={track} size={art} rounded={radius.card} style={styles.artShadow} />
        </View>

        {/* Title + like */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1, marginRight: space.md }}>
            <T numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 22 }}>
              {track.Name}
            </T>
            <T variant="caption" numberOfLines={1} style={{ fontSize: 16, marginTop: 2 }}>
              {artistLine(track)}
            </T>
          </View>
          <Pressable hitSlop={10} onPress={tap(() => p().setFavorite(track.Id, !favorite))}>
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={28}
              color={favorite ? colors.accent : colors.text}
            />
          </Pressable>
        </View>

        <SeekBar position={position} duration={duration} onSeek={(s) => p().seek(s)} />

        {/* Transport */}
        <View style={styles.controls}>
          <Pressable hitSlop={10} onPress={tap(() => p().toggleShuffle())}>
            <Ionicons name="shuffle" size={26} color={shuffle ? colors.accent : colors.text} />
            {shuffle ? <View style={styles.dot} /> : null}
          </Pressable>
          <Pressable hitSlop={10} onPress={tap(() => p().previous())}>
            <Ionicons name="play-skip-back" size={34} color={colors.text} />
          </Pressable>
          <Pressable onPress={tap(() => p().toggle())} style={styles.playBtn}>
            {buffering ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Ionicons name={playing ? 'pause' : 'play'} size={34} color="#000" style={{ marginLeft: playing ? 0 : 4 }} />
            )}
          </Pressable>
          <Pressable hitSlop={10} onPress={tap(() => p().next())}>
            <Ionicons name="play-skip-forward" size={34} color={colors.text} />
          </Pressable>
          <Pressable hitSlop={10} onPress={tap(() => p().cycleRepeat())}>
            <Ionicons name="repeat" size={26} color={repeat !== 'off' ? colors.accent : colors.text} />
            {repeat === 'one' ? (
              <T style={styles.repeatOne}>1</T>
            ) : repeat === 'all' ? (
              <View style={styles.dot} />
            ) : null}
          </Pressable>
        </View>

        {error ? (
          <T variant="caption" color={colors.danger} style={{ textAlign: 'center', marginBottom: space.sm }}>
            {error}
          </T>
        ) : null}

        {/* Output + queue */}
        <View style={styles.bottomRow}>
          {RoutePicker ? (
            <RoutePicker style={{ width: 30, height: 30 }} tintColor={colors.text} activeTintColor={colors.accent} />
          ) : (
            <Ionicons name="phone-portrait-outline" size={22} color={colors.textMuted} />
          )}
          <Pressable hitSlop={12} onPress={() => router.push('/lyrics')} style={styles.lyricsBtn}>
            <Ionicons name="mic" size={18} color="#000" />
            <T style={{ fontFamily: fonts.bold, fontSize: 13, color: '#000' }}>Lyrics</T>
          </Pressable>
          <Pressable hitSlop={12} onPress={() => router.push('/queue')}>
            <Ionicons name="list" size={26} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101010' },
  header: { flexDirection: 'row', alignItems: 'center', height: 44 },
  artShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    marginBottom: space.lg,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  repeatOne: {
    position: 'absolute',
    top: -4,
    right: -6,
    fontFamily: fonts.black,
    fontSize: 10,
    color: colors.accent,
  },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lyricsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
});
