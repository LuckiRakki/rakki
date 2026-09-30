import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  queryClient,
  useMostPlayed,
  usePlaylists,
  useRandomAlbums,
  useRecentlyAdded,
  useRecentlyPlayed,
  useRediscover,
} from '@/api/queries';
import { useAuth } from '@/auth/store';
import { withAlpha } from '@/lib/color';
import { greeting } from '@/lib/format';
import { QuickTile } from '@/ui/AlbumTile';
import { LikedArt } from '@/ui/LikedArt';
import { openLibrary } from '@/ui/nav';
import { Shelf } from '@/ui/Shelf';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

export default function HomeScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const userName = useAuth((s) => s.session?.userName ?? '');
  const recent = useRecentlyPlayed();
  const added = useRecentlyAdded();
  const mostPlayed = useMostPlayed();
  const rediscover = useRediscover();
  const random = useRandomAlbums();
  const playlists = usePlaylists();

  // Quick picks: Liked Songs plus the five most recently played albums.
  const quick = recent.data?.slice(0, 5) ?? [];
  const jumpBackIn = recent.data?.slice(5) ?? [];
  const refreshing = recent.isRefetching || added.isRefetching;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + t.space.md, paddingBottom: t.space.xl }}
      refreshControl={
        <RefreshControl refreshing={refreshing} tintColor={t.colors.text} onRefresh={() => void queryClient.invalidateQueries()} />
      }>
      <LinearGradient
        colors={[withAlpha(t.colors.accent, 0.22), t.colors.bg]}
        style={[StyleSheet.absoluteFill, { height: 320 }]}
        pointerEvents="none"
      />
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/settings')} style={styles.avatar} hitSlop={8}>
          <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(15), color: '#000' }}>
            {userName.charAt(0).toUpperCase() || '?'}
          </T>
        </Pressable>
        <T variant="display">{greeting()}</T>
      </View>

      <View style={styles.grid}>
        {chunk([null, ...quick], 2).map((pair, i) => (
          <View key={i} style={styles.gridRow}>
            {pair.map((a) =>
              a ? (
                <QuickTile key={a.Id} album={a} />
              ) : (
                <Pressable
                  key="liked"
                  onPress={() => router.push('/liked')}
                  style={({ pressed }) => [styles.likedTile, pressed && { backgroundColor: t.colors.surface3 }]}>
                  <LikedArt size={56} />
                  <T numberOfLines={2} style={{ flex: 1, paddingHorizontal: 10, fontFamily: t.fonts.bold, fontSize: t.size(13) }}>
                    Liked Songs
                  </T>
                </Pressable>
              ),
            )}
            {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}
      </View>

      <Shelf title="Jump back in" items={jumpBackIn} />
      <Shelf title="Your playlists" items={playlists.data} onShowAll={() => openLibrary('playlists')} />
      <Shelf title="Recently added" items={added.data} />
      <Shelf title="Most played" items={mostPlayed.data} />
      <Shelf title="Rediscover" items={rediscover.data} />
      <Shelf title="Random picks" items={random.data} />
    </ScrollView>
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingHorizontal: t.space.lg,
    marginBottom: t.space.lg,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { paddingHorizontal: t.space.lg, gap: t.space.sm },
  gridRow: { flexDirection: 'row', gap: t.space.sm },
  likedTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: t.radius.art,
    overflow: 'hidden',
    backgroundColor: t.colors.surface2,
  },
}));
