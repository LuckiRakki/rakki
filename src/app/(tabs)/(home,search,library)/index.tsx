import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  queryClient,
  useMostPlayed,
  useMusicVideos,
  useDailyMixes,
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
import { noteEmpty, wasEmpty } from '@/lib/shapes';
import { Bone, Line, barWidth, gaveUp, Reveal, ShelfSkeleton, useReveal, type Part, type Step } from '@/ui/Reveal';
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
import { VIDEO_TILE, VideoShelf } from '@/ui/VideoShelf';
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
  const mixes = useDailyMixes();
  const topArtists = useTopArtists();
  const videos = useMusicVideos();
  const hasStations = useStations((s) => s.stations.length > 0);

  const { homeOrder, homeHidden, quickPicks, greeting: showGreeting } = t.appearance;

  // Quick picks: Liked Songs plus the five most recently played albums.
  const quick = quickPicks ? (recent.data?.slice(0, 5) ?? []) : [];
  const jumpBackIn = recent.data?.slice(quick.length) ?? [];
  const shelves: Record<ShelfId, ReactNode> = {
    jumpBackIn: <Shelf key="jumpBackIn" title="Jump back in" items={jumpBackIn} />,
    dailyMixes: (
      <Shelf key="dailyMixes" title="Your Daily Mixes" items={mixes.data} onShowAll={() => openLibrary('mixes')} />
    ),
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
  // What each shelf is now: its items (undefined while loading) and whether it failed. One that
  // was empty last time doesn't hold a place while it loads.
  const lists: Record<ShelfId, { items?: unknown[]; failed?: boolean }> = {
    jumpBackIn: { items: recent.data && jumpBackIn, failed: gaveUp(recent) },
    dailyMixes: { items: mixes.data, failed: gaveUp(mixes) },
    playlists: { items: playlists.data, failed: gaveUp(playlists) },
    artists: { items: topArtists.data, failed: gaveUp(topArtists) },
    recentlyAdded: { items: added.data, failed: gaveUp(added) },
    mostPlayed: { items: mostPlayed.data, failed: gaveUp(mostPlayed) },
    rediscover: { items: rediscover.data, failed: gaveUp(rediscover) },
    random: { items: random.data, failed: gaveUp(random) },
    musicVideos: { items: videos.data && newestVideos(videos.data), failed: gaveUp(videos) },
    radio: { items: hasStations ? [1] : [] },
  };
  const order = homeOrder.filter((id) => !homeHidden.includes(id));
  const parts: Part[] = [
    quickPicks ? (recent.data || gaveUp(recent) ? 'ready' : 'loading') : 'empty',
    ...order.map((id): Part => {
      const { items, failed } = lists[id];
      if (items) return items.length ? 'ready' : 'empty';
      return failed || wasEmpty(`home.${id}`) ? 'empty' : 'loading';
    }),
  ];
  const [quickStep, ...shelfSteps] = useReveal(parts);
  // Remember which shelves came back empty, for next time.
  const settled = order.map((id) => `${id}:${lists[id].items ? lists[id].items.length > 0 : '?'}`).join(',');
  useEffect(() => {
    for (const entry of settled.split(',')) {
      const [id, has] = entry.split(':');
      if (id && has !== '?') noteEmpty(`home.${id}`, has === 'false');
    }
  }, [settled]);
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

      {quickPicks ? (
        <View style={styles.grid}>
          {chunk([null, ...(quickStep.show === 'content' ? quick : QUICK_SLOTS)], 2).map((pair, i) => (
            <View key={i} style={styles.gridRow}>
              {pair.map((a, j) =>
                a === null ? (
                  <Pressable
                    key="liked"
                    onPress={() => router.push('/liked')}
                    style={({ pressed }) => [styles.likedTile, pressed && { backgroundColor: t.colors.surface3 }]}>
                    <LikedArt size={56} />
                    <T numberOfLines={2} style={{ flex: 1, paddingHorizontal: 10, fontFamily: t.fonts.bold, fontSize: t.size(13) }}>
                      Liked Songs
                    </T>
                  </Pressable>
                ) : typeof a === 'number' ? (
                  <Reveal key={`slot${a}`} step={beat(quickStep, a)} placeholder={<QuickSkeleton i={a} />} style={{ flex: 1 }}>
                    {null}
                  </Reveal>
                ) : (
                  <Reveal key={a.Id} step={beat(quickStep, i * 2 + j)} style={{ flex: 1 }}>
                    <QuickTile album={a} />
                  </Reveal>
                ),
              )}
              {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {order.map((id, i) => (
        <Reveal
          key={id}
          step={shelfSteps[i]}
          placeholder={
            id === 'musicVideos' ? (
              <ShelfSkeleton size={VIDEO_TILE.width} height={VIDEO_TILE.height} />
            ) : (
              <ShelfSkeleton round={id === 'artists'} />
            )
          }>
          {shelves[id]}
        </Reveal>
      ))}
    </ScrollView>
  );
}

/** Failed, or not asking (offline with no answer from the downloads): its shelf is left out. */
/** Quick picks' album tiles while they load: five places beside Liked Songs. */
const QUICK_SLOTS = [0, 1, 2, 3, 4];

/** One tile's turn: the quick picks fade in one after another. */
const beat = (step: Step, i: number): Step => ({ ...step, delay: step.delay + i * 35 });

/** A quick-pick tile still loading. */
function QuickSkeleton({ i }: { i: number }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: t.radius.art, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' }}>
      <Bone style={{ width: 56, height: 56 }} />
      <Line variant="body" size={t.size(13)} width={barWidth(i, 10)} style={{ flex: 1, marginHorizontal: 10 }} />
    </View>
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
