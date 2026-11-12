import { FlatList } from 'react-native';

import { matchesSearch, useDailyMixes } from '@/api/queries';
import { mixArtists } from '@/lib/mixes';
import { ItemTile } from '@/ui/AlbumTile';
import { ItemRow } from '@/ui/ItemRow';
import { T } from '@/ui/T';
import { useDockSpace } from '@/ui/dock';
import { useTheme } from '@/ui/theme';
import { FadeRow, GridSkeleton, Hold, ItemRowsSkeleton } from '@/ui/Reveal';
import { type ListProps, NoMatches, useListReveal, usePullToRefresh, useTileSize } from '@/library/tabs/shared';

/** Daily Mixes: the playlists the Rakki plugin makes every night (lib/mixes.ts). */
export function Mixes({ header, sort, layout, filter }: ListProps) {
  const t = useTheme();
  const dock = useDockSpace();
  const mixes = useDailyMixes();
  const refresh = usePullToRefresh(sort, mixes.refetch);
  const { gap, tile, columns } = useTileSize();
  const data = (mixes.data ?? []).filter((x) => matchesSearch(x, filter));
  const { step, fade } = useListReveal(mixes);
  const empty = step.show === 'placeholder' ? (
    <Hold step={step}>
      {layout === 'grid' ? <GridSkeleton tile={tile} columns={columns} gap={gap} rowGap={t.space.xl} rows={2} /> : <ItemRowsSkeleton count={6} />}
    </Hold>
  ) : mixes.isLoading ? null : filter ? (
    <NoMatches filter={filter} />
  ) : (
    <T variant="caption" style={{ textAlign: 'center', padding: t.space.xl }}>
      No Daily Mixes yet. The Rakki plugin on your server makes them every night.
    </T>
  );

  if (layout === 'grid') {
    return (
      <FlatList
        windowSize={7}
        key={`mixes-grid-${columns}`}
        data={data}
        keyExtractor={(p) => p.Id}
        numColumns={columns}
        columnWrapperStyle={{ gap, paddingHorizontal: t.space.lg }}
        contentContainerStyle={{ paddingBottom: t.space.xl + dock, gap: t.space.xl }}
        refreshControl={refresh}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => (
          <FadeRow entering={fade(index)}>
            <ItemTile item={item} size={tile} />
          </FadeRow>
        )}
      />
    );
  }
  return (
    <FlatList
      windowSize={7}
      key="mixes-list"
      data={data}
      keyExtractor={(p) => p.Id}
      contentContainerStyle={{ paddingBottom: t.space.xl + dock }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item, index }) => (
        <FadeRow entering={fade(index)}>
          <ItemRow item={item} subtitle={mixArtists(item)} />
        </FadeRow>
      )}
    />
  );
}
