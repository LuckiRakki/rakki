import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { useAlbumArtists, useAlbums, useLikedSongs, usePlaylists } from '@/api/queries';
import { songCount } from '@/lib/format';
import { kindLine } from '@/lib/items';
import { createPlaylist } from '@/library/actions';
import { layoutFor, SORTS, sortFor, useLibraryView, type LibraryLayout, type LibraryTab, type SortOption } from '@/library/view';
import { ItemTile } from '@/ui/AlbumTile';
import { Chip, ItemRow } from '@/ui/ItemRow';
import { LikedArt } from '@/ui/LikedArt';
import { openOptions } from '@/ui/overlays';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

const TABS: { key: LibraryTab; label: string }[] = [
  { key: 'playlists', label: 'Playlists' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' },
];

/** Tile width for an n-column grid with the standard side gutters. */
function useTileSize(columns: number) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const gap = t.space.lg;
  return { gap, tile: Math.floor((width - t.space.lg * 2 - gap * (columns - 1)) / columns) };
}

export default function LibraryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tab = useLibraryView((s) => s.tab);
  const sort = useLibraryView((s) => sortFor(s, s.tab));
  const layout = useLibraryView((s) => layoutFor(s, s.tab));

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
        <Pressable hitSlop={10} accessibilityLabel="Create playlist" onPress={() => void createPlaylist()}>
          <Ionicons name="add" size={30} color={t.colors.text} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: t.space.sm, paddingHorizontal: t.space.lg, marginTop: t.space.md }}>
        {TABS.map((x) => (
          <Chip
            key={x.key}
            label={x.label}
            active={tab === x.key}
            onPress={() => useLibraryView.getState().setTab(x.key)}
          />
        ))}
      </View>
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
        <Pressable
          hitSlop={10}
          onPress={() => useLibraryView.getState().toggleLayout(tab)}
          accessibilityLabel={layout === 'grid' ? 'Show as list' : 'Show as grid'}>
          <Ionicons name={layout === 'grid' ? 'list' : 'grid-outline'} size={20} color={t.colors.text} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {tab === 'albums' ? <Albums header={header} sort={sort} layout={layout} /> : null}
      {tab === 'artists' ? <Artists header={header} sort={sort} layout={layout} /> : null}
      {tab === 'playlists' ? <Playlists header={header} sort={sort} layout={layout} /> : null}
    </View>
  );
}

interface ListProps {
  header: ReactElement;
  sort: SortOption;
  layout: LibraryLayout;
}

function Albums({ header, sort, layout }: ListProps) {
  const t = useTheme();
  const albums = useAlbums(sort.sortBy, sort.sortOrder);
  const items = albums.data?.pages.flatMap((p) => p.Items) ?? [];
  const grid = layout === 'grid';
  const { gap, tile } = useTileSize(2);
  const subtitle = (a: BaseItem) =>
    sort.key === 'year' && a.ProductionYear ? `${kindLine(a)} · ${a.ProductionYear}` : kindLine(a);
  return (
    <FlatList
      key={`albums-${layout}`}
      data={items}
      keyExtractor={(a) => a.Id}
      numColumns={grid ? 2 : 1}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl, gap: grid ? t.space.xl : 0 }}
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
  const artists = useAlbumArtists(sort.sortBy, sort.sortOrder);
  const items = artists.data?.pages.flatMap((p) => p.Items) ?? [];
  const grid = layout === 'grid';
  const { gap, tile } = useTileSize(3);
  return (
    <FlatList
      key={`artists-${layout}`}
      data={items}
      keyExtractor={(a) => a.Id}
      numColumns={grid ? 3 : 1}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl, gap: grid ? t.space.lg : 0 }}
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

const LIKED: BaseItem = { Id: 'liked', Name: 'Liked Songs', Type: 'Playlist' };

function Playlists({ header, sort, layout }: ListProps) {
  const t = useTheme();
  const playlists = usePlaylists();
  const liked = useLikedSongs();
  const grid = layout === 'grid';
  const { gap, tile } = useTileSize(2);
  const likedLine = `Playlist${liked.data ? ` · ${songCount(liked.data.length)}` : ''}`;

  const sorted = [...(playlists.data ?? [])].sort((a, b) =>
    sort.key === 'recent'
      ? (b.DateCreated ?? '').localeCompare(a.DateCreated ?? '')
      : a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' }),
  );
  // Liked Songs is always first, like Spotify's pinned playlist.
  const data: BaseItem[] = [LIKED, ...sorted];

  if (grid) {
    return (
      <FlatList
        key="playlists-grid"
        data={data}
        keyExtractor={(p) => p.Id}
        numColumns={2}
        columnWrapperStyle={{ gap, paddingHorizontal: t.space.lg }}
        contentContainerStyle={{ paddingBottom: t.space.xl, gap: t.space.xl }}
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
      ListHeaderComponent={header}
      ListFooterComponent={
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
