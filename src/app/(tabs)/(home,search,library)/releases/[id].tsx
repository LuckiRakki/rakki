import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useArtistAlbums, useItem } from '@/api/queries';
import { isSingleOrEp, releaseKind } from '@/lib/items';
import { ItemTile } from '@/ui/AlbumTile';
import { FadeRow, GridSkeleton, Hold, Line, partOf, useReveal, useRowFade } from '@/ui/Reveal';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/** An artist's whole Discography, or all their Singles and EPs (the artist page's "Show all"). */
export default function ReleasesScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const artist = useItem(id);
  const albums = useArtistAlbums(id);
  const singles = kind === 'singles';
  const items = (albums.data ?? []).filter((a) => isSingleOrEp(a) === singles);
  const columns = t.appearance.gridColumns;
  const gap = t.space.lg;
  const tile = Math.floor((width - t.space.lg * 2 - gap * (columns - 1)) / columns);
  // While they load, placeholder tiles hold the grid's place; then the releases fade in.
  const [grid] = useReveal([partOf(albums.data, { failed: albums.isError })]);
  const tileFade = useRowFade(grid);
  const name = artist.data?.Name;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        windowSize={7}
        key={`releases-${columns}`}
        data={grid.show === 'content' ? items : []}
        keyExtractor={(a) => a.Id}
        numColumns={columns}
        columnWrapperStyle={{ gap, paddingHorizontal: t.space.lg }}
        contentContainerStyle={{ paddingBottom: t.space.xxl, gap: t.space.xl }}
        ListHeaderComponent={
          <View style={{ paddingTop: insets.top + t.space.sm, paddingHorizontal: t.space.lg, paddingBottom: t.space.sm }}>
            <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 36, height: 36, justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={26} color={t.colors.text} />
            </Pressable>
            <T variant="display" style={{ marginTop: t.space.sm }}>
              {singles ? 'Singles and EPs' : 'Discography'}
            </T>
            {name ? (
              <T variant="caption" style={{ marginTop: 2, fontSize: t.size(14) }}>
                {[name, albums.data ? (items.length === 1 ? '1 release' : `${items.length} releases`) : null].filter(Boolean).join(' · ')}
              </T>
            ) : artist.data === undefined && !artist.isError ? (
              <Line variant="caption" size={t.size(14)} width="44%" style={{ marginTop: 2 }} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Hold step={grid}>
            <GridSkeleton tile={tile} columns={columns} gap={gap} rowGap={t.space.xl} rows={4} />
          </Hold>
        }
        renderItem={({ item, index }) => (
          <FadeRow entering={tileFade(index)}>
            <ItemTile
              item={item}
              size={tile}
              subtitle={[item.ProductionYear, releaseKind(item)].filter(Boolean).join(' · ')}
            />
          </FadeRow>
        )}
      />
    </View>
  );
}
