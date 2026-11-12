import { ActivityIndicator, FlatList } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { useAlbums } from '@/api/queries';
import { kindLine } from '@/lib/items';
import { useLibraryView } from '@/library/view';
import { ItemTile } from '@/ui/AlbumTile';
import { ItemRow } from '@/ui/ItemRow';
import { useTheme } from '@/ui/theme';
import { FadeRow, GridSkeleton, Hold, ItemRowsSkeleton } from '@/ui/Reveal';
import { type ListProps, NoMatches, useListReveal, usePullToRefresh, useTileSize } from '@/library/tabs/shared';

export function Albums({ header, sort, layout, filter }: ListProps) {
  const t = useTheme();
  const seed = useLibraryView((s) => s.shuffleSeed);
  const albums = useAlbums(sort.sortBy, sort.sortOrder, seed, filter);
  const refresh = usePullToRefresh(sort, albums.refetch, albums.isPlaceholderData);
  const items = albums.data?.pages.flatMap((p) => p.Items) ?? [];
  const grid = layout === 'grid';
  const { gap, tile, columns } = useTileSize();
  const subtitle = (a: BaseItem) =>
    sort.key === 'year' && a.ProductionYear ? `${kindLine(a)} · ${a.ProductionYear}` : kindLine(a);
  const { step, fade } = useListReveal(albums);
  return (
    <FlatList
      windowSize={7}
      key={`albums-${layout}-${columns}`}
      data={items}
      keyExtractor={(a) => a.Id}
      numColumns={grid ? columns : 1}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl, gap: grid ? t.space.xl : 0 }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListEmptyComponent={
        step.show === 'placeholder' ? (
          <Hold step={step}>{grid ? <GridSkeleton tile={tile} columns={columns} gap={gap} rowGap={t.space.xl} /> : <ItemRowsSkeleton count={10} />}</Hold>
        ) : filter ? (
          <NoMatches filter={filter} />
        ) : null
      }
      ListFooterComponent={albums.isFetchingNextPage ? <ActivityIndicator color={t.colors.textMuted} /> : null}
      onEndReachedThreshold={1.5}
      onEndReached={() => {
        if (albums.hasNextPage && !albums.isFetchingNextPage) void albums.fetchNextPage();
      }}
      renderItem={({ item, index }) => (
        <FadeRow entering={fade(index)}>{grid ? <ItemTile item={item} size={tile} /> : <ItemRow item={item} subtitle={subtitle(item)} />}</FadeRow>
      )}
    />
  );
}
