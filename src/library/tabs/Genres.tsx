import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';

import type { GenreCount } from '@/api/jellyfin';
import { matchesSearch, useGenreCounts } from '@/api/queries';
import { seededShuffle, useLibraryView } from '@/library/view';
import { Artwork } from '@/ui/Artwork';
import { GenreTile } from '@/ui/GenreTile';
import { openGenre } from '@/ui/nav';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { FadeRow, GridSkeleton, Hold, ItemRowsSkeleton } from '@/ui/Reveal';
import { type ListProps, useListReveal, usePullToRefresh } from '@/library/tabs/shared';

/** Every genre in the library (offline: the downloaded albums' genres). */
export function Genres({ header, sort, layout, filter }: ListProps) {
  const t = useTheme();
  const seed = useLibraryView((s) => s.shuffleSeed);
  const genres = useGenreCounts();
  const refresh = usePullToRefresh(sort, genres.refetch);
  const { width } = useWindowDimensions();
  const all = (genres.data ?? []).filter((g) => matchesSearch({ Name: g.name }, filter));
  const items =
    sort.key === 'random'
      ? seededShuffle(all, seed)
      : sort.key === 'alpha'
        ? [...all].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        : all;
  const grid = layout === 'grid';
  const gap = t.space.md;
  const tile = Math.floor((width - t.space.lg * 2 - gap) / 2);
  const { step, fade } = useListReveal(genres);
  return (
    <FlatList
      windowSize={7}
      key={`genres-${layout}`}
      data={items}
      keyExtractor={(g) => g.name}
      numColumns={grid ? 2 : 1}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl, gap: grid ? gap : 0 }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <Hold step={step}>
          {grid ? (
            <GridSkeleton tile={tile} height={Math.round(tile * 0.56)} columns={2} gap={gap} rowGap={gap} rows={7} bare />
          ) : (
            <ItemRowsSkeleton count={10} art={48} />
          )}
        </Hold>
      }
      renderItem={({ item, index }) => (
        <FadeRow entering={fade(index)}>
          {grid ? <GenreTile genre={item} width={tile} height={Math.round(tile * 0.56)} /> : <GenreRow genre={item} />}
        </FadeRow>
      )}
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
