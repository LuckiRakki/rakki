import { ActivityIndicator, FlatList, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlbums } from '@/api/queries';
import { AlbumTile } from '@/ui/AlbumTile';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

const COLUMNS = 2;

export default function LibraryScreen() {
  const t = useTheme();
  const GAP = t.space.lg;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const albums = useAlbums();
  const items = albums.data?.pages.flatMap((p) => p.Items) ?? [];
  const total = albums.data?.pages[0]?.TotalRecordCount;
  const tile = Math.floor((width - t.space.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        data={items}
        keyExtractor={(a) => a.Id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: t.space.lg }}
        contentContainerStyle={{ paddingTop: insets.top + t.space.md, paddingBottom: t.space.xl, gap: t.space.xl }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: t.space.lg }}>
            <T variant="display">Your Library</T>
            <T variant="caption" style={{ marginTop: t.space.xs }}>
              {total !== undefined ? `${total} albums` : ' '}
            </T>
          </View>
        }
        ListEmptyComponent={
          albums.isLoading ? (
            <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xxl }} />
          ) : albums.error ? (
            <T variant="caption" style={{ padding: t.space.lg }}>
              Couldn’t load albums: {albums.error.message}
            </T>
          ) : null
        }
        ListFooterComponent={
          albums.isFetchingNextPage ? <ActivityIndicator color={t.colors.textMuted} /> : null
        }
        onEndReachedThreshold={1.5}
        onEndReached={() => {
          if (albums.hasNextPage && !albums.isFetchingNextPage) void albums.fetchNextPage();
        }}
        renderItem={({ item }) => <AlbumTile album={item} size={tile} />}
      />
    </View>
  );
}
