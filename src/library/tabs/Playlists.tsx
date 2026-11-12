import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { Ionicons } from '@/ui/Icon';
import type { BaseItem } from '@/api/jellyfin';
import { matchesSearch, useLikedSongs, usePlaylists } from '@/api/queries';
import { songCount } from '@/lib/format';
import { useOffline } from '@/lib/online';
import { createPlaylist } from '@/library/actions';
import { seededShuffle, useLibraryView } from '@/library/view';
import { ItemTile } from '@/ui/AlbumTile';
import { ItemRow } from '@/ui/ItemRow';
import { LikedArt } from '@/ui/LikedArt';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { FadeRow, Hold, ItemRowSkeleton, TileSkeleton } from '@/ui/Reveal';
import { type ListProps, useListReveal, usePullToRefresh, useTileSize } from '@/library/tabs/shared';

const LIKED: BaseItem = { Id: 'liked', Name: 'Liked Songs', Type: 'Playlist' };

/** Places for your playlists while they load, after Liked Songs (which is there at once). */
const PLACES: BaseItem[] = Array.from({ length: 8 }, (_, i) => ({ Id: `place-${i}`, Name: '', Type: 'Placeholder' }));

export function Playlists({ header, sort, layout, filter }: ListProps) {
  const t = useTheme();
  const offline = useOffline();
  const playlists = usePlaylists();
  const liked = useLikedSongs();
  const refresh = usePullToRefresh(sort, playlists.refetch);
  const grid = layout === 'grid';
  const { gap, tile, columns } = useTileSize();
  const likedLine = `Playlist${liked.data ? ` · ${songCount(liked.data.length)}` : ''}`;

  const seed = useLibraryView((s) => s.shuffleSeed);
  const found = (playlists.data ?? []).filter((x) => matchesSearch(x, filter));
  const sorted =
    sort.key === 'random'
      ? seededShuffle(found, seed)
      : [...found].sort((a, b) =>
          sort.key === 'recent'
            ? (b.DateCreated ?? '').localeCompare(a.DateCreated ?? '')
            : a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' }),
        );
  const { step, fade } = useListReveal(playlists);
  const loading = step.show === 'placeholder';
  // Liked Songs is always first, like Spotify's pinned playlist (and found by a search too).
  const data: BaseItem[] = [...(matchesSearch(LIKED, filter) ? [LIKED] : []), ...(loading ? PLACES : sorted)];
  // A playlist's place while they load (fading in a beat after another), or the playlist fading in.
  const place = (item: BaseItem, index: number, drawn: ReactElement) =>
    item.Type === 'Placeholder' ? (
      <Hold step={{ ...step, delay: step.delay + index * 40 }}>{grid ? <TileSkeleton size={tile} i={index} /> : <ItemRowSkeleton i={index} />}</Hold>
    ) : (
      <FadeRow entering={fade(index)}>{drawn}</FadeRow>
    );

  if (grid) {
    return (
      <FlatList
        windowSize={7}
        key={`playlists-grid-${columns}`}
        data={data}
        keyExtractor={(p) => p.Id}
        numColumns={columns}
        columnWrapperStyle={{ gap, paddingHorizontal: t.space.lg }}
        contentContainerStyle={{ paddingBottom: t.space.xl, gap: t.space.xl }}
        refreshControl={refresh}
        ListHeaderComponent={header}
        renderItem={({ item, index }) =>
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
            place(item, index, <ItemTile item={item} size={tile} />)
          )
        }
      />
    );
  }

  return (
    <FlatList
      windowSize={7}
      key="playlists-list"
      data={data}
      keyExtractor={(p) => p.Id}
      contentContainerStyle={{ paddingBottom: t.space.xl }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListFooterComponent={
        offline || loading ? null : (
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
      renderItem={({ item, index }) =>
        item.Id === LIKED.Id ? (
          <ItemRow item={item} subtitle={likedLine} art={<LikedArt size={56} />} onPress={() => router.push('/liked')} />
        ) : (
          place(item, index, <ItemRow item={item} subtitle={`Playlist · ${songCount(item.ChildCount ?? 0)}`} />)
        )
      }
    />
  );
}
