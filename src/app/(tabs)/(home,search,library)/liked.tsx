import { router } from 'expo-router';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { useLikedSongs } from '@/api/queries';
import { withAlpha } from '@/lib/color';
import { songCount } from '@/lib/format';
import { usePlayer } from '@/player/store';
import { BackButton, CollectionHeader } from '@/ui/CollectionHeader';
import { DownloadButton } from '@/ui/DownloadButton';
import { LikedArt } from '@/ui/LikedArt';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

const LIKED = { Id: 'liked', Name: 'Liked Songs', Type: 'Playlist' };

export default function LikedSongsScreen() {
  const t = useTheme();
  const liked = useLikedSongs();
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const playing = usePlayer((s) => s.playing);
  const isThis = usePlayer((s) => s.source?.type === 'playlist' && s.source.id === 'liked');
  const list = liked.data ?? [];
  const source = { type: 'playlist' as const, id: 'liked', name: 'Liked Songs' };

  const header = (
    <View>
      <CollectionHeader
        art={<LikedArt size={232} />}
        tint={withAlpha(t.colors.accent, 0.55)}
        title="Liked Songs"
        lines={['Playlist', list.length ? songCount(list.length) : '']}
        playing={isThis && playing}
        onPlay={() => {
          if (isThis) return usePlayer.getState().toggle();
          if (list.length) usePlayer.getState().playQueue(list, { source });
        }}
        onShuffle={() => list.length && usePlayer.getState().playQueue(list, { source, shuffle: true })}
        download={list.length ? <DownloadButton kind="liked" item={LIKED} /> : undefined}
      />
      {liked.isLoading ? <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} /> : null}
      {!liked.isLoading && list.length === 0 ? (
        <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
          Songs you like will appear here. Tap the heart on any song.
        </T>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        data={list}
        keyExtractor={(x) => x.Id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: t.space.xl }}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            art
            active={item.Id === currentId}
            playing={playing}
            onPress={() => usePlayer.getState().playQueue(list, { startIndex: index, source })}
          />
        )}
      />
      <BackButton onPress={() => router.back()} />
    </View>
  );
}
