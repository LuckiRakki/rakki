import { router } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';

import { Ionicons } from '@/ui/Icon';
import { matchesSearch } from '@/api/queries';
import { songCount } from '@/lib/format';
import { kindLine } from '@/lib/items';
import { useDownloads, type DownloadedCollection } from '@/downloads/store';
import { seededShuffle, useLibraryView } from '@/library/view';
import { ItemTile } from '@/ui/AlbumTile';
import { ItemRow } from '@/ui/ItemRow';
import { LikedArt } from '@/ui/LikedArt';
import { openItem } from '@/ui/nav';
import { T } from '@/ui/T';
import { useDockSpace } from '@/ui/dock';
import { useTheme } from '@/ui/theme';
import { usePlayer } from '@/player/store';
import { type ListProps, usePullToRefresh, useTileSize } from '@/library/tabs/shared';

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
export function Downloaded({ header, sort, layout, filter }: ListProps) {
  const t = useTheme();
  const dock = useDockSpace();
  const collections = useDownloads((s) => s.collections);
  const refresh = usePullToRefresh(sort);
  const grid = layout === 'grid';
  const { gap, tile, columns } = useTileSize();

  const byName = (a: DownloadedCollection, b: DownloadedCollection) =>
    a.item.Name.localeCompare(b.item.Name, undefined, { sensitivity: 'base' });
  const order = sort.key === 'alpha' ? byName : (a: DownloadedCollection, b: DownloadedCollection) => b.addedAt - a.addedAt;
  const seed = useLibraryView((s) => s.shuffleSeed);
  const all = Object.values(collections).filter((c) => matchesSearch(c.item, filter));
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
      windowSize={7}
      key={`downloads-${layout}-${columns}`}
      data={data}
      keyExtractor={(c) => c.id}
      numColumns={grid ? columns : 1}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl + dock, gap: grid ? t.space.xl : 0 }}
      refreshControl={refresh}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item }) =>
        grid ? <DownloadedTile c={item} size={tile} onPress={() => open(item)} /> : <DownloadedRow c={item} onPress={() => open(item)} />
      }
    />
  );
}
