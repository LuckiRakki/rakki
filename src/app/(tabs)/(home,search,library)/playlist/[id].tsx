import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { useItem, usePlaylistItems } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { songCount, ticksToSeconds } from '@/lib/format';
import { usePlayer } from '@/player/store';
import { Artwork } from '@/ui/Artwork';
import { BackButton, CollectionHeader } from '@/ui/CollectionHeader';
import { openMenu } from '@/ui/overlays';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const client = useAuth((s) => s.client);
  const playlist = useItem(id);
  const items = usePlaylistItems(id);
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const playing = usePlayer((s) => s.playing);
  const isThis = usePlayer((s) => s.source?.type === 'playlist' && s.source.id === id);

  const p = playlist.data;
  const list = items.data ?? [];
  const minutes = Math.round(list.reduce((sum, x) => sum + ticksToSeconds(x.RunTimeTicks), 0) / 60);
  const source = { type: 'playlist' as const, id, name: p?.Name ?? 'Playlist' };

  if (playlist.error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg, alignItems: 'center', justifyContent: 'center', padding: t.space.xl }}>
        <T variant="heading">This playlist no longer exists</T>
        <BackButton onPress={() => router.back()} />
      </View>
    );
  }

  const header = (
    <View>
      <CollectionHeader
        art={<Artwork item={p} size={232} />}
        tint={artColor(p && client?.blurhash(p))}
        title={p?.Name ?? ' '}
        lines={[
          'Playlist',
          list.length ? `${songCount(list.length)}, ${minutes} min` : '',
        ]}
        playing={isThis && playing}
        onPlay={() => {
          if (isThis) return usePlayer.getState().toggle();
          if (list.length) usePlayer.getState().playQueue(list, { source });
        }}
        onShuffle={() => list.length && usePlayer.getState().playQueue(list, { source, shuffle: true })}
        onMore={p ? () => openMenu(p) : undefined}
      />
      {items.isLoading ? <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} /> : null}
      {!items.isLoading && list.length === 0 ? (
        <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
          This playlist is empty. Long-press any song and choose Add to playlist.
        </T>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        data={list}
        keyExtractor={(x, i) => x.PlaylistItemId ?? `${x.Id}-${i}`}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: t.space.xl }}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            art
            active={item.Id === currentId}
            playing={playing}
            onPress={() => usePlayer.getState().playQueue(list, { startIndex: index, source })}
            onLongPress={() => openMenu(item, { playlistId: id, entryId: item.PlaylistItemId })}
          />
        )}
      />
      <BackButton onPress={() => router.back()} />
    </View>
  );
}
