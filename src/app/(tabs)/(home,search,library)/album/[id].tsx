import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlbumTracks, useItem } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { songCount, ticksToSeconds } from '@/lib/format';
import { openMenu } from '@/ui/overlays';
import { usePlayer } from '@/player/store';
import { ArtistLinks } from '@/ui/ArtistLinks';
import { Artwork } from '@/ui/Artwork';
import { openArtist } from '@/ui/nav';
import { T } from '@/ui/T';
import { TrackRow } from '@/ui/TrackRow';
import { makeStyles, useTheme } from '@/ui/theme';

const ART = 232;

export default function AlbumScreen() {
  const t = useTheme();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const client = useAuth((s) => s.client);
  const album = useItem(id);
  const tracks = useAlbumTracks(id);
  const artists = album.data?.AlbumArtists?.filter((a) => a.Id) ?? [];
  const firstArtist = useItem(artists[0]?.Id);
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
        colors={[tint, t.colors.bg]}
        style={{ paddingTop: insets.top + 56, paddingBottom: t.space.lg, alignItems: 'center' }}>
        <Artwork item={album.data} size={ART} style={styles.artShadow} />
      </LinearGradient>
      <View style={{ paddingHorizontal: t.space.lg }}>
        <T variant="title">{album.data?.Name ?? ' '}</T>
        <View style={styles.artistRow}>
          {artists.length ? (
            <Pressable onPress={() => openArtist(artists[0].Id)} hitSlop={6}>
              <Artwork item={firstArtist.data} size={24} rounded={12} />
            </Pressable>
          ) : null}
          <ArtistLinks artists={artists} fallback={album.data?.AlbumArtist} style={{ flex: 1 }} />
        </View>
        <T variant="caption" style={{ marginTop: t.space.xs }}>
          {['Album', album.data?.ProductionYear, list.length ? `${songCount(list.length)}, ${minutes} min` : null]
            .filter(Boolean)
            .join(' · ')}
        </T>
        <View style={styles.actions}>
          <Pressable hitSlop={8} onPress={() => play(true)}>
            <Ionicons name="shuffle" size={28} color={t.colors.textSecondary} />
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
      {tracks.isLoading ? <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} /> : null}
      {tracks.error ? (
        <T variant="caption" style={{ padding: t.space.lg }}>
          Couldn’t load tracks: {tracks.error.message}
        </T>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        data={list}
        keyExtractor={(t) => t.Id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: t.space.xl }}
        renderItem={({ item, index }) => {
          const disc = item.ParentIndexNumber ?? 1;
          const newDisc = multiDisc && (index === 0 || (list[index - 1].ParentIndexNumber ?? 1) !== disc);
          return (
            <>
              {newDisc ? (
                <View style={styles.disc}>
                  <Ionicons name="disc-outline" size={16} color={t.colors.textSecondary} />
                  <T variant="bodyStrong" color={t.colors.textSecondary} style={{ fontSize: t.size(13) }}>
                    Disc {disc}
                  </T>
                </View>
              ) : null}
              <TrackRow
                track={item}
                active={item.Id === currentId}
                playing={playing}
                onPress={() => usePlayer.getState().playQueue(list, { startIndex: index, source })}
                onLongPress={() => openMenu(item)}
              />
            </>
          );
        }}
      />
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={[styles.back, { top: insets.top + t.space.sm }]}>
        <Ionicons name="chevron-back" size={24} color={t.colors.text} />
      </Pressable>
      {album.data ? (
        <Pressable
          onPress={() => openMenu(album.data!)}
          hitSlop={10}
          accessibilityLabel="More options"
          style={[styles.more, { top: insets.top + t.space.sm }]}>
          <Ionicons name="ellipsis-horizontal" size={22} color={t.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  artShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    marginTop: t.space.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: t.space.md,
    marginBottom: t.space.sm,
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.lg,
    paddingBottom: t.space.xs,
  },
  back: {
    position: 'absolute',
    left: t.space.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: {
    position: 'absolute',
    right: t.space.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
