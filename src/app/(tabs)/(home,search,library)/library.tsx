import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem, GenreCount } from '@/api/jellyfin';
import { useAlbumArtists, useAlbums, useGenreCounts, useLikedSongs, usePlaylists, useTracks } from '@/api/queries';
import { songCount } from '@/lib/format';
import { kindLine } from '@/lib/items';
import { useDownloads, type DownloadedCollection } from '@/downloads/store';
import { useOffline } from '@/lib/online';
import { createPlaylist, playRandom } from '@/library/actions';
import {
  layoutFor,
  seededShuffle,
  SORTS,
  sortFor,
  useLibraryView,
  type LibraryLayout,
  type LibraryTab,
  type SortOption,
} from '@/library/view';
import { ItemTile } from '@/ui/AlbumTile';
import { Artwork } from '@/ui/Artwork';
import { GenreTile } from '@/ui/GenreTile';
import { Chip, ItemRow } from '@/ui/ItemRow';
import { LikedArt } from '@/ui/LikedArt';
import { openGenre, openItem } from '@/ui/nav';
import { openOptions } from '@/ui/overlays';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { usePlayer } from '@/player/store';
import { TrackRow } from '@/ui/TrackRow';

const TABS: { key: LibraryTab; label: string }[] = [
  { key: 'playlists', label: 'Playlists' },
  { key: 'albums', label: 'Albums' },
  { key: 'songs', label: 'Songs' },
  { key: 'artists', label: 'Artists' },
  { key: 'genres', label: 'Genres' },
  { key: 'downloads', label: 'Downloaded' },
];

/** Tile width for an n-column grid with the standard side gutters. */
/** Album grids follow Customize → Album grid columns; `extra` adds columns (artists' round tiles). */
function useTileSize(extra = 0) {
  const t = useTheme();
  const columns = t.appearance.gridColumns + extra;
  const { width } = useWindowDimensions();
  const gap = t.space.lg;
  return { gap, columns, tile: Math.floor((width - t.space.lg * 2 - gap * (columns - 1)) / columns) };
}

export default function LibraryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tab = useLibraryView((s) => s.tab);
  const sort = useLibraryView((s) => sortFor(s, s.tab));
  const layout = useLibraryView((s) => layoutFor(s, s.tab));
  const offline = useOffline();

  const chooseSort = () =>
    openOptions({
      title: 'Sort by',
      options: SORTS[tab].map(({ key, label }) => ({ key, label })),
      selected: sort.key,
      onSelect: (key) => useLibraryView.getState().setSort(tab, key),
    });

  const header = (
    <View style={{ paddingTop: insets.top + t.space.md, paddingBottom: t.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg }}>
        <T variant="display" style={{ flex: 1 }}>
          Your Library
        </T>
        {offline ? null : (
          <Pressable hitSlop={10} accessibilityLabel="Create playlist" onPress={() => void createPlaylist()}>
            <Ionicons name="add" size={30} color={t.colors.text} />
          </Pressable>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: t.space.md, flexGrow: 0 }}
        contentContainerStyle={{ gap: t.space.sm, paddingHorizontal: t.space.lg }}>
        {TABS.map((x) => (
          <Chip
            key={x.key}
            label={x.label}
            active={tab === x.key}
            onPress={() => useLibraryView.getState().setTab(x.key)}
          />
        ))}
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: t.space.lg,
          marginTop: t.space.lg,
        }}>
        <Pressable
          hitSlop={8}
          onPress={chooseSort}
          accessibilityLabel={`Sort by ${sort.label}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.xs }}>
          <Ionicons name="swap-vertical" size={16} color={t.colors.text} />
          <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(13) }}>{sort.label}</T>
        </Pressable>
        {tab === 'songs' ? null : (
          <Pressable
            hitSlop={10}
            onPress={() => useLibraryView.getState().toggleLayout(tab)}
            accessibilityLabel={layout === 'grid' ? 'Show as list' : 'Show as grid'}>
            <Ionicons name={layout === 'grid' ? 'list' : 'grid-outline'} size={20} color={t.colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {tab === 'albums' ? <Albums header={header} sort={sort} layout={layout} /> : null}
      {tab === 'songs' ? <Songs header={header} sort={sort} layout={layout} /> : null}
      {tab === 'artists' ? <Artists header={header} sort={sort} layout={layout} /> : null}
      {tab === 'genres' ? <Genres header={header} sort={sort} layout={layout} /> : null}
      {tab === 'playlists' ? <Playlists header={header} sort={sort} layout={layout} /> : null}
      {tab === 'downloads' ? <Downloaded header={header} sort={sort} layout={layout} /> : null}
    </View>
  );
}

interface ListProps {
  header: ReactElement;
  sort: SortOption;
  layout: LibraryLayout;
}

/**
 * Pull to refresh, like Home: with Random it reshuffles, otherwise it reloads from the server.
 * `loadingNew` keeps the spinner up while a new shuffle loads (the old list stays meanwhile).
 */
function usePullToRefresh(sort: SortOption, refetch?: () => Promise<unknown>, loadingNew = false) {
  const t = useTheme();
  const [pulling, setPulling] = useState(false);
  const onRefresh = async () => {
    setPulling(true);
    try {
      if (sort.key === 'random') useLibraryView.getState().reshuffle();
      else await refetch?.();
    } finally {
      setPulling(false);
    }
  };
  return <RefreshControl refreshing={pulling || loadingNew} onRefresh={() => void onRefresh()} tintColor={t.colors.text} />;
}

function Albums({ header, sort, layout }: ListProps) {
  const t = useTheme();
  const seed = useLibraryView((s) => s.shuffleSeed);
  const albums = useAlbums(sort.sortBy, sort.sortOrder, seed);
  const refresh = usePullToRefresh(sort, albums.refetch, albums.isPlaceholderData);
  const items = albums.data?.pages.flatMap((p) => p.Items) ?? [];
  const grid = layout === 'grid';
  const { gap, tile, columns } = useTileSize();
  const subtitle = (a: BaseItem) =>
    sort.key === 'year' && a.ProductionYear ? `${kindLine(a)} · ${a.ProductionYear}` : kindLine(a);
  return (
    <FlatList
      key={`albums-${layout}-${columns}`}
      data={items}
      keyExtractor={(a) => a.Id}
      numColumns={grid ? columns : 1}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl, gap: grid ? t.space.xl : 0 }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListEmptyComponent={albums.isLoading ? <ActivityIndicator color={t.colors.text} /> : null}
      ListFooterComponent={albums.isFetchingNextPage ? <ActivityIndicator color={t.colors.textMuted} /> : null}
      onEndReachedThreshold={1.5}
      onEndReached={() => {
        if (albums.hasNextPage && !albums.isFetchingNextPage) void albums.fetchNextPage();
      }}
      renderItem={({ item }) => (grid ? <ItemTile item={item} size={tile} /> : <ItemRow item={item} subtitle={subtitle(item)} />)}
    />
  );
}

function Artists({ header, sort, layout }: ListProps) {
  const t = useTheme();
  const seed = useLibraryView((s) => s.shuffleSeed);
  const artists = useAlbumArtists(sort.sortBy, sort.sortOrder, seed);
  const refresh = usePullToRefresh(sort, artists.refetch, artists.isPlaceholderData);
  const items = artists.data?.pages.flatMap((p) => p.Items) ?? [];
  const grid = layout === 'grid';
  const { gap, tile, columns } = useTileSize(1);
  return (
    <FlatList
      key={`artists-${layout}-${columns}`}
      data={items}
      keyExtractor={(a) => a.Id}
      numColumns={grid ? columns : 1}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl, gap: grid ? t.space.lg : 0 }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListEmptyComponent={artists.isLoading ? <ActivityIndicator color={t.colors.text} /> : null}
      ListFooterComponent={artists.isFetchingNextPage ? <ActivityIndicator color={t.colors.textMuted} /> : null}
      onEndReachedThreshold={1.5}
      onEndReached={() => {
        if (artists.hasNextPage && !artists.isFetchingNextPage) void artists.fetchNextPage();
      }}
      renderItem={({ item }) => (grid ? <ItemTile item={item} size={tile} /> : <ItemRow item={item} subtitle="Artist" />)}
    />
  );
}

/** Every genre in the library (offline: the downloaded albums' genres). */
function Genres({ header, sort, layout }: ListProps) {
  const t = useTheme();
  const seed = useLibraryView((s) => s.shuffleSeed);
  const genres = useGenreCounts();
  const refresh = usePullToRefresh(sort, genres.refetch);
  const { width } = useWindowDimensions();
  const all = genres.data ?? [];
  const items =
    sort.key === 'random'
      ? seededShuffle(all, seed)
      : sort.key === 'alpha'
        ? [...all].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        : all;
  const grid = layout === 'grid';
  const gap = t.space.md;
  const tile = Math.floor((width - t.space.lg * 2 - gap) / 2);
  return (
    <FlatList
      key={`genres-${layout}`}
      data={items}
      keyExtractor={(g) => g.name}
      numColumns={grid ? 2 : 1}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl, gap: grid ? gap : 0 }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListEmptyComponent={genres.isLoading ? <ActivityIndicator color={t.colors.text} /> : null}
      renderItem={({ item }) =>
        grid ? <GenreTile genre={item} width={tile} height={Math.round(tile * 0.56)} /> : <GenreRow genre={item} />
      }
    />
  );
}

function GenreRow({ genre }: { genre: GenreCount }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => openGenre(genre.name)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.sm,
        backgroundColor: pressed ? t.colors.surface : 'transparent',
      })}>
      {genre.album ? (
        <Artwork item={genre.album} size={48} />
      ) : (
        <View style={{ width: 48, height: 48, borderRadius: t.radius.art, backgroundColor: t.colors.surface2 }} />
      )}
      <View style={{ flex: 1, marginLeft: t.space.md }}>
        <T variant="bodyStrong" numberOfLines={1}>
          {genre.name}
        </T>
        <T variant="caption">{genre.count === 1 ? '1 album' : `${genre.count} albums`}</T>
      </View>
    </Pressable>
  );
}

const LIKED: BaseItem = { Id: 'liked', Name: 'Liked Songs', Type: 'Playlist' };

function Playlists({ header, sort, layout }: ListProps) {
  const t = useTheme();
  const offline = useOffline();
  const playlists = usePlaylists();
  const liked = useLikedSongs();
  const refresh = usePullToRefresh(sort, playlists.refetch);
  const grid = layout === 'grid';
  const { gap, tile, columns } = useTileSize();
  const likedLine = `Playlist${liked.data ? ` · ${songCount(liked.data.length)}` : ''}`;

  const seed = useLibraryView((s) => s.shuffleSeed);
  const sorted =
    sort.key === 'random'
      ? seededShuffle(playlists.data ?? [], seed)
      : [...(playlists.data ?? [])].sort((a, b) =>
          sort.key === 'recent'
            ? (b.DateCreated ?? '').localeCompare(a.DateCreated ?? '')
            : a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' }),
        );
  // Liked Songs is always first, like Spotify's pinned playlist.
  const data: BaseItem[] = [LIKED, ...sorted];

  if (grid) {
    return (
      <FlatList
        key={`playlists-grid-${columns}`}
        data={data}
        keyExtractor={(p) => p.Id}
        numColumns={columns}
        columnWrapperStyle={{ gap, paddingHorizontal: t.space.lg }}
        contentContainerStyle={{ paddingBottom: t.space.xl, gap: t.space.xl }}
        refreshControl={refresh}
        ListHeaderComponent={header}
        renderItem={({ item }) =>
          item.Id === LIKED.Id ? (
            <Pressable onPress={() => router.push('/liked')} style={({ pressed }) => ({ width: tile, opacity: pressed ? 0.7 : 1 })}>
              <LikedArt size={tile} />
              <T variant="bodyStrong" numberOfLines={1} style={{ marginTop: 8, fontSize: t.size(14) }}>
                Liked Songs
              </T>
              <T variant="caption" numberOfLines={1}>
                {likedLine}
              </T>
            </Pressable>
          ) : (
            <ItemTile item={item} size={tile} />
          )
        }
      />
    );
  }

  return (
    <FlatList
      key="playlists-list"
      data={data}
      keyExtractor={(p) => p.Id}
      contentContainerStyle={{ paddingBottom: t.space.xl }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListFooterComponent={
        offline ? null : (
          <Pressable
            onPress={() => void createPlaylist()}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: t.space.lg,
              paddingVertical: t.space.sm,
              opacity: pressed ? 0.7 : 1,
            })}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: t.radius.art,
                backgroundColor: t.colors.surface2,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="add" size={28} color={t.colors.textSecondary} />
            </View>
            <T variant="bodyStrong" style={{ marginLeft: t.space.md }}>
              Create playlist
            </T>
          </Pressable>
        )
      }
      renderItem={({ item }) =>
        item.Id === LIKED.Id ? (
          <ItemRow item={item} subtitle={likedLine} art={<LikedArt size={56} />} onPress={() => router.push('/liked')} />
        ) : (
          <ItemRow item={item} subtitle={`Playlist · ${songCount(item.ChildCount ?? 0)}`} />
        )
      }
    />
  );
}

/** What a downloaded collection says under its name: "Album · 12 songs", "Downloading 3 of 12". */
function useDownloadLine(c: DownloadedCollection): string {
  const done = useDownloads((st) => c.trackIds.filter((id) => st.tracks[id]?.state === 'done').length);
  const total = c.trackIds.length;
  const kind = c.kind === 'album' ? 'Album' : c.kind === 'song' ? 'Song' : 'Playlist';
  if (c.kind === 'song') return kindLine(c.item);
  return done < total ? `${kind} · Downloading ${done} of ${total}` : `${kind} · ${songCount(total)}`;
}

function DownloadedRow({ c, onPress }: { c: DownloadedCollection; onPress: () => void }) {
  const line = useDownloadLine(c);
  return (
    <ItemRow
      item={c.item}
      subtitle={line}
      art={c.kind === 'liked' ? <LikedArt size={56} /> : undefined}
      onPress={onPress}
    />
  );
}

function DownloadedTile({ c, size, onPress }: { c: DownloadedCollection; size: number; onPress: () => void }) {
  const t = useTheme();
  const line = useDownloadLine(c);
  if (c.kind !== 'liked') return <ItemTile item={c.item} size={size} onPress={onPress} />;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: size, opacity: pressed ? 0.7 : 1 })}>
      <LikedArt size={size} />
      <T variant="bodyStrong" numberOfLines={1} style={{ marginTop: 8, fontSize: t.size(14) }}>
        Liked Songs
      </T>
      <T variant="caption" numberOfLines={1}>
        {line}
      </T>
    </Pressable>
  );
}

/** Everything on the phone: albums, playlists, Liked Songs, then single songs. */
function Downloaded({ header, sort, layout }: ListProps) {
  const t = useTheme();
  const collections = useDownloads((s) => s.collections);
  const refresh = usePullToRefresh(sort);
  const grid = layout === 'grid';
  const { gap, tile, columns } = useTileSize();

  const byName = (a: DownloadedCollection, b: DownloadedCollection) =>
    a.item.Name.localeCompare(b.item.Name, undefined, { sensitivity: 'base' });
  const order = sort.key === 'alpha' ? byName : (a: DownloadedCollection, b: DownloadedCollection) => b.addedAt - a.addedAt;
  const seed = useLibraryView((s) => s.shuffleSeed);
  const all = Object.values(collections);
  const arrange = (list: DownloadedCollection[]) => (sort.key === 'random' ? seededShuffle(list, seed) : list.sort(order));
  const songs = arrange(all.filter((c) => c.kind === 'song'));
  const data = [...arrange(all.filter((c) => c.kind !== 'song')), ...songs];

  const open = (c: DownloadedCollection) => {
    if (c.kind === 'liked') return router.push('/liked');
    if (c.kind === 'song') {
      // Single downloaded songs play as one list, starting from the one tapped.
      const list = songs.map((x) => x.item);
      return usePlayer.getState().playQueue(list, {
        startIndex: list.findIndex((x) => x.Id === c.item.Id),
        source: { type: 'tracks', name: 'Downloaded songs' },
      });
    }
    openItem(c.item);
  };

  const empty = (
    <View style={{ alignItems: 'center', padding: t.space.xl }}>
      <Ionicons name="arrow-down-circle-outline" size={40} color={t.colors.textMuted} />
      <T variant="bodyStrong" style={{ marginTop: t.space.md }}>
        Nothing downloaded yet
      </T>
      <T variant="caption" style={{ textAlign: 'center', marginTop: t.space.xs }}>
        Tap the download arrow on an album, playlist or Liked Songs to keep it on your iPhone.
      </T>
    </View>
  );

  return (
    <FlatList
      key={`downloads-${layout}-${columns}`}
      data={data}
      keyExtractor={(c) => c.id}
      numColumns={grid ? columns : 1}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl, gap: grid ? t.space.xl : 0 }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item }) =>
        grid ? <DownloadedTile c={item} size={tile} onPress={() => open(item)} /> : <DownloadedRow c={item} onPress={() => open(item)} />
      }
    />
  );
}

/** Every song in the library, as a list. Tapping one plays the list from there. */
function Songs({ header, sort }: ListProps) {
  const t = useTheme();
  const seed = useLibraryView((s) => s.shuffleSeed);
  const tracks = useTracks(sort.sortBy, sort.sortOrder, seed);
  const refresh = usePullToRefresh(sort, tracks.refetch, tracks.isPlaceholderData);
  const items = tracks.data?.pages.flatMap((p) => p.Items) ?? [];
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const playing = usePlayer((s) => s.playing);
  return (
    <FlatList
      key="songs"
      data={items}
      keyExtractor={(x) => x.Id}
      contentContainerStyle={{ paddingBottom: t.space.xl }}
      refreshControl={refresh}
      ListHeaderComponent={
        <View>
          {header}
          <Pressable
            onPress={() => void playRandom()}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              gap: t.space.sm,
              marginHorizontal: t.space.lg,
              marginBottom: t.space.sm,
              paddingHorizontal: t.space.lg,
              height: 38,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.accent,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Ionicons name="shuffle" size={18} color="#000" />
            <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(13), color: '#000' }}>Shuffle all songs</T>
          </Pressable>
        </View>
      }
      ListEmptyComponent={tracks.isLoading ? <ActivityIndicator color={t.colors.text} /> : null}
      ListFooterComponent={tracks.isFetchingNextPage ? <ActivityIndicator color={t.colors.textMuted} /> : null}
      onEndReachedThreshold={1.5}
      onEndReached={() => {
        if (tracks.hasNextPage && !tracks.isFetchingNextPage) void tracks.fetchNextPage();
      }}
      renderItem={({ item, index }) => (
        <TrackRow
          track={item}
          art
          active={item.Id === currentId}
          playing={playing}
          onPress={() => usePlayer.getState().playQueue(items, { startIndex: index, source: { type: 'tracks', name: 'Your songs' } })}
        />
      )}
    />
  );
}
