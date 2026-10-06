import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  queryClient,
  useMostPlayed,
  useMusicVideos,
  usePlaylists,
  useRandomAlbums,
  useRecentlyAdded,
  useRecentlyPlayed,
  useRediscover,
  useTopArtists,
} from '@/api/queries';
import type { ShelfId } from '@/appearance/store';
import { switchAccount } from '@/auth/actions';
import { accountKey, useAuth } from '@/auth/store';
import { withAlpha } from '@/lib/color';
import { greeting } from '@/lib/format';
import { QuickTile } from '@/ui/AlbumTile';
import { Rise } from '@/ui/Rise';
import { LikedArt } from '@/ui/LikedArt';
import { tick } from '@/lib/haptics';
import { playRandom } from '@/library/actions';
import { useLibraryView } from '@/library/view';
import { openLibrary } from '@/ui/nav';
import { openOptions } from '@/ui/overlays';
import { Shelf } from '@/ui/Shelf';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { UserAvatar } from '@/ui/UserAvatar';
import { VideoShelf } from '@/ui/VideoShelf';
import { RadioShelf } from '@/radio/RadioShelf';
import { useStations } from '@/radio/stations';
import { newestVideos } from '@/video/musicVideos';

export default function HomeScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const recent = useRecentlyPlayed();
  const added = useRecentlyAdded();
  const mostPlayed = useMostPlayed();
  const rediscover = useRediscover();
  const random = useRandomAlbums();
  const playlists = usePlaylists();
  const topArtists = useTopArtists();
  const videos = useMusicVideos();
  const hasStations = useStations((s) => s.stations.length > 0);

  const { homeOrder, homeHidden, quickPicks, greeting: showGreeting } = t.appearance;

  // Quick picks: Liked Songs plus the five most recently played albums.
  const quick = quickPicks ? (recent.data?.slice(0, 5) ?? []) : [];
  const jumpBackIn = recent.data?.slice(quick.length) ?? [];
  const shelves: Record<ShelfId, ReactNode> = {
    jumpBackIn: <Shelf key="jumpBackIn" title="Jump back in" items={jumpBackIn} />,
    playlists: (
      <Shelf key="playlists" title="Your playlists" items={playlists.data} onShowAll={() => openLibrary('playlists')} />
    ),
    artists: <Shelf key="artists" title="Artists you play" items={topArtists.data} />,
    recentlyAdded: (
      <Shelf
        key="recentlyAdded"
        title="Recently added"
        items={added.data}
        onShowAll={() => {
          useLibraryView.getState().setSort('albums', 'recent');
          openLibrary('albums');
        }}
      />
    ),
    mostPlayed: <Shelf key="mostPlayed" title="Most played" items={mostPlayed.data} />,
    rediscover: <Shelf key="rediscover" title="Rediscover" items={rediscover.data} />,
    random: <Shelf key="random" title="Random picks" items={random.data} />,
    musicVideos: (
      <VideoShelf key="musicVideos" title="Music videos" videos={newestVideos(videos.data)} onShowAll={() => openLibrary('videos')} />
    ),
    radio: <RadioShelf key="radio" />,
  };
  // Which shelves have something to show yet (the rest rise in when their items arrive).
  const ready: Record<ShelfId, boolean> = {
    jumpBackIn: jumpBackIn.length > 0,
    playlists: !!playlists.data?.length,
    artists: !!topArtists.data?.length,
    recentlyAdded: !!added.data?.length,
    mostPlayed: !!mostPlayed.data?.length,
    rediscover: !!rediscover.data?.length,
    random: !!random.data?.length,
    musicVideos: !!videos.data?.length,
    radio: hasStations,
  };
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
      <Rise order={0}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.push('/settings')}
            onLongPress={openAccountSwitcher}
            hitSlop={8}
            accessibilityLabel="Settings (hold to switch account)">
            <UserAvatar size={34} />
          </Pressable>
          {showGreeting ? (
            <T variant="display" numberOfLines={1} style={{ flex: 1 }}>
              {greeting()}
            </T>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Pressable
            onPress={() => {
              tick();
              void playRandom();
            }}
            hitSlop={8}
            accessibilityLabel="Shuffle your whole library"
            style={({ pressed }) => [styles.shuffle, pressed && { transform: [{ scale: 0.94 }] }]}>
            <Ionicons name="shuffle" size={20} color="#000" />
          </Pressable>
        </View>
      </Rise>

      {quickPicks ? (
        <Rise order={1}>
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
        </Rise>
      ) : null}

      {homeOrder
        .filter((id) => !homeHidden.includes(id))
        .map((id, i) => (
          <Rise key={id} order={i + 2} ready={ready[id]}>
            {shelves[id]}
          </Rise>
        ))}
    </ScrollView>
  );
}

/** Hold the avatar: switch between signed-in accounts (or add one). */
function openAccountSwitcher() {
  const { accounts, session } = useAuth.getState();
  if (accounts.length < 2) return router.push('/add-account');
  openOptions({
    title: 'Switch account',
    options: [
      ...accounts.map((a) => ({ key: accountKey(a), label: `${a.userName} · ${a.serverName}` })),
      { key: 'add', label: 'Add account' },
    ],
    selected: session ? accountKey(session) : undefined,
    onSelect: (key) => {
      if (key === 'add') return router.push('/add-account');
      const next = accounts.find((a) => accountKey(a) === key);
      if (next) void switchAccount(next);
    },
  });
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
  shuffle: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
