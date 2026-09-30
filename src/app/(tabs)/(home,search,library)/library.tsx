import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { useAlbumArtists, useAlbums, useLikedSongs, usePlaylists } from '@/api/queries';
import { songCount } from '@/lib/format';
import { createPlaylist } from '@/library/actions';
import { useLibraryView, type LibraryTab as Tab } from '@/library/view';
import { ItemTile } from '@/ui/AlbumTile';
import { Chip, ItemRow } from '@/ui/ItemRow';
import { LikedArt } from '@/ui/LikedArt';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

const TABS: { key: Tab; label: string }[] = [
  { key: 'playlists', label: 'Playlists' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' },
];
const COLUMNS = 2;

export default function LibraryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tab = useLibraryView((s) => s.tab);
  const choose = useLibraryView((s) => s.setTab);

  const header = (
    <View style={{ paddingTop: insets.top + t.space.md, paddingBottom: t.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg }}>
        <T variant="display" style={{ flex: 1 }}>
          Your Library
        </T>
        <Pressable hitSlop={10} onPress={() => void createPlaylist()}>
          <Ionicons name="add" size={30} color={t.colors.text} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: t.space.sm, paddingHorizontal: t.space.lg, marginTop: t.space.md }}>
        {TABS.map((x) => (
          <Chip key={x.key} label={x.label} active={tab === x.key} onPress={() => choose(x.key)} />
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {tab === 'albums' ? <AlbumsGrid header={header} /> : null}
      {tab === 'artists' ? <ArtistsList header={header} /> : null}
      {tab === 'playlists' ? <PlaylistsList header={header} /> : null}
    </View>
  );
}

function AlbumsGrid({ header }: { header: React.ReactElement }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const albums = useAlbums();
  const items = albums.data?.pages.flatMap((p) => p.Items) ?? [];
  const gap = t.space.lg;
  const tile = Math.floor((width - t.space.lg * 2 - gap * (COLUMNS - 1)) / COLUMNS);
  return (
    <FlatList
      key="albums"
      data={items}
      keyExtractor={(a) => a.Id}
      numColumns={COLUMNS}
      columnWrapperStyle={{ gap, paddingHorizontal: t.space.lg }}
      contentContainerStyle={{ paddingBottom: t.space.xl, gap: t.space.xl }}
      ListHeaderComponent={header}
      ListEmptyComponent={albums.isLoading ? <ActivityIndicator color={t.colors.text} /> : null}
      ListFooterComponent={albums.isFetchingNextPage ? <ActivityIndicator color={t.colors.textMuted} /> : null}
      onEndReachedThreshold={1.5}
      onEndReached={() => {
        if (albums.hasNextPage && !albums.isFetchingNextPage) void albums.fetchNextPage();
      }}
      renderItem={({ item }) => <ItemTile item={item} size={tile} />}
    />
  );
}

function ArtistsList({ header }: { header: React.ReactElement }) {
  const t = useTheme();
  const artists = useAlbumArtists();
  const items = artists.data?.pages.flatMap((p) => p.Items) ?? [];
  return (
    <FlatList
      key="artists"
      data={items}
      keyExtractor={(a) => a.Id}
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: t.space.xl }}
      ListEmptyComponent={artists.isLoading ? <ActivityIndicator color={t.colors.text} /> : null}
      ListFooterComponent={artists.isFetchingNextPage ? <ActivityIndicator color={t.colors.textMuted} /> : null}
      onEndReachedThreshold={1.5}
      onEndReached={() => {
        if (artists.hasNextPage && !artists.isFetchingNextPage) void artists.fetchNextPage();
      }}
      renderItem={({ item }) => <ItemRow item={item} subtitle="Artist" />}
    />
  );
}

function PlaylistsList({ header }: { header: React.ReactElement }) {
  const t = useTheme();
  const playlists = usePlaylists();
  const liked = useLikedSongs();
  const likedItem: BaseItem = { Id: 'liked', Name: 'Liked Songs', Type: 'Playlist' };
  return (
    <FlatList
      key="playlists"
      data={playlists.data ?? []}
      keyExtractor={(p) => p.Id}
      contentContainerStyle={{ paddingBottom: t.space.xl }}
      ListHeaderComponent={
        <View>
          {header}
          <ItemRow
            item={likedItem}
            subtitle={`Playlist${liked.data ? ` · ${songCount(liked.data.length)}` : ''}`}
            art={<LikedArt size={56} />}
            onPress={() => router.push('/liked')}
          />
        </View>
      }
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
      renderItem={({ item }) => (
        <ItemRow item={item} subtitle={`Playlist · ${songCount(item.ChildCount ?? 0)}`} />
      )}
    />
  );
}
