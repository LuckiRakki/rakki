import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlbumTracks, useItem } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { ticksToSeconds } from '@/lib/format';
import { showTrackActions } from '@/player/actions';
import { usePlayer } from '@/player/store';
import { Artwork } from '@/ui/Artwork';
import { T } from '@/ui/T';
import { TrackRow } from '@/ui/TrackRow';
import { colors, radius, space } from '@/ui/theme';

const ART = 232;

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const client = useAuth((s) => s.client);
  const album = useItem(id);
  const tracks = useAlbumTracks(id);
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const isThisAlbum = usePlayer((s) => s.source?.type === 'album' && s.source.id === id);
  const playing = usePlayer((s) => s.playing);

  const list = tracks.data ?? [];
  const multiDisc = new Set(list.map((t) => t.ParentIndexNumber ?? 1)).size > 1;
  const minutes = Math.round(list.reduce((sum, t) => sum + ticksToSeconds(t.RunTimeTicks), 0) / 60);
  const tint = artColor(album.data && client?.blurhash(album.data));
  const source = { type: 'album' as const, id, name: album.data?.Name ?? 'Album' };

  function play(shuffle = false) {
    if (list.length === 0) return;
    if (!shuffle && isThisAlbum) {
      usePlayer.getState().toggle();
      return;
    }
    usePlayer.getState().playQueue(list, { source, shuffle });
  }

  const header = (
    <View>
      <LinearGradient
        colors={[tint, colors.bg]}
        style={{ paddingTop: insets.top + 56, paddingBottom: space.lg, alignItems: 'center' }}>
        <Artwork item={album.data} size={ART} style={styles.artShadow} />
      </LinearGradient>
      <View style={{ paddingHorizontal: space.lg }}>
        <T variant="title">{album.data?.Name ?? ' '}</T>
        <T variant="bodyStrong" style={{ marginTop: space.sm }}>
          {album.data?.AlbumArtist ?? ''}
        </T>
        <T variant="caption" style={{ marginTop: space.xs }}>
          {['Album', album.data?.ProductionYear, list.length ? `${list.length} songs, ${minutes} min` : null]
            .filter(Boolean)
            .join(' · ')}
        </T>
        <View style={styles.actions}>
          <Pressable hitSlop={8} onPress={() => play(true)}>
            <Ionicons name="shuffle" size={28} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => play()}
            style={({ pressed }) => [styles.playBtn, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Ionicons
              name={isThisAlbum && playing ? 'pause' : 'play'}
              size={28}
              color="#000"
              style={{ marginLeft: isThisAlbum && playing ? 0 : 3 }}
            />
          </Pressable>
        </View>
      </View>
      {tracks.isLoading ? <ActivityIndicator color={colors.text} style={{ marginTop: space.xl }} /> : null}
      {tracks.error ? (
        <T variant="caption" style={{ padding: space.lg }}>
          Couldn’t load tracks: {tracks.error.message}
        </T>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={list}
        keyExtractor={(t) => t.Id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: space.xl }}
        renderItem={({ item, index }) => {
          const disc = item.ParentIndexNumber ?? 1;
          const newDisc = multiDisc && (index === 0 || (list[index - 1].ParentIndexNumber ?? 1) !== disc);
          return (
            <>
              {newDisc ? (
                <View style={styles.disc}>
                  <Ionicons name="disc-outline" size={16} color={colors.textSecondary} />
                  <T variant="bodyStrong" color={colors.textSecondary} style={{ fontSize: 13 }}>
                    Disc {disc}
                  </T>
                </View>
              ) : null}
              <TrackRow
                track={item}
                active={item.Id === currentId}
                playing={playing}
                onPress={() => usePlayer.getState().playQueue(list, { startIndex: index, source })}
                onLongPress={() => showTrackActions(item)}
              />
            </>
          );
        }}
      />
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={[styles.back, { top: insets.top + space.sm }]}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  artShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    marginBottom: space.sm,
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  back: {
    position: 'absolute',
    left: space.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
