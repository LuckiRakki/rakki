import { ActivityIndicator, FlatList } from 'react-native';

import { useAlbumArtists } from '@/api/queries';
import { useLibraryView } from '@/library/view';
import { ItemTile } from '@/ui/AlbumTile';
import { ItemRow } from '@/ui/ItemRow';
import { useDockSpace } from '@/ui/dock';
import { useTheme } from '@/ui/theme';
import { FadeRow, GridSkeleton, Hold, ItemRowsSkeleton } from '@/ui/Reveal';
import { type ListProps, NoMatches, useListReveal, usePullToRefresh, useTileSize } from '@/library/tabs/shared';

export function Artists({ header, sort, layout, filter }: ListProps) {
  const t = useTheme();
  const dock = useDockSpace();
  const seed = useLibraryView((s) => s.shuffleSeed);
  const artists = useAlbumArtists(sort.sortBy, sort.sortOrder, seed, filter);
  const refresh = usePullToRefresh(sort, artists.refetch, artists.isPlaceholderData);
  const items = artists.data?.pages.flatMap((p) => p.Items) ?? [];
  const grid = layout === 'grid';
  const { gap, tile, columns } = useTileSize(1);
  const { step, fade } = useListReveal(artists);
  return (
    <FlatList
      windowSize={7}
      key={`artists-${layout}-${columns}`}
      data={items}
      keyExtractor={(a) => a.Id}
      numColumns={grid ? columns : 1}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl + dock, gap: grid ? t.space.lg : 0 }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListEmptyComponent={
        step.show === 'placeholder' ? (
          <Hold step={step}>
            {grid ? <GridSkeleton tile={tile} columns={columns} gap={gap} rowGap={t.space.lg} rows={4} round /> : <ItemRowsSkeleton count={10} round />}
          </Hold>
        ) : filter ? (
          <NoMatches filter={filter} />
        ) : null
      }
      ListFooterComponent={artists.isFetchingNextPage ? <ActivityIndicator color={t.colors.textMuted} /> : null}
      onEndReachedThreshold={1.5}
      onEndReached={() => {
        if (artists.hasNextPage && !artists.isFetchingNextPage) void artists.fetchNextPage();
      }}
      renderItem={({ item, index }) => (
        <FadeRow entering={fade(index)}>{grid ? <ItemTile item={item} size={tile} /> : <ItemRow item={item} subtitle="Artist" />}</FadeRow>
      )}
    />
  );
}
