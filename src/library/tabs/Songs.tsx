import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { Ionicons } from '@/ui/Icon';
import { useTracks } from '@/api/queries';
import { playRandom } from '@/library/actions';
import { useLibraryView } from '@/library/view';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { usePlayer } from '@/player/store';
import { TrackRow } from '@/ui/TrackRow';
import { FadeRow, Hold, TrackRowsSkeleton } from '@/ui/Reveal';
import { type ListProps, NoMatches, useListReveal, usePullToRefresh } from '@/library/tabs/shared';

/** Every song in the library, as a list. Tapping one plays the list from there. */
export function Songs({ header, sort, filter }: ListProps) {
  const t = useTheme();
  const seed = useLibraryView((s) => s.shuffleSeed);
  const tracks = useTracks(sort.sortBy, sort.sortOrder, seed, filter);
  const refresh = usePullToRefresh(sort, tracks.refetch, tracks.isPlaceholderData);
  const items = tracks.data?.pages.flatMap((p) => p.Items) ?? [];
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const playing = usePlayer((s) => s.playing);
  const { step, fade } = useListReveal(tracks);
  return (
    <FlatList
      windowSize={7}
      key="songs"
      data={items}
      keyExtractor={(x) => x.Id}
      contentContainerStyle={{ paddingBottom: t.space.xl }}
      refreshControl={refresh}
      ListHeaderComponent={
        <View>
          {header}
          <Pressable
            onPress={() => void playRandom()}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              gap: t.space.sm,
              marginHorizontal: t.space.lg,
              marginBottom: t.space.sm,
              paddingHorizontal: t.space.lg,
              height: 38,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.accent,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Ionicons name="shuffle" size={18} color="#000" />
            <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(13), color: '#000' }}>Shuffle all songs</T>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        step.show === 'placeholder' ? (
          <Hold step={step}>
            <TrackRowsSkeleton count={12} art />
          </Hold>
        ) : filter ? (
          <NoMatches filter={filter} />
        ) : null
      }
      ListFooterComponent={tracks.isFetchingNextPage ? <ActivityIndicator color={t.colors.textMuted} /> : null}
      onEndReachedThreshold={1.5}
      onEndReached={() => {
        if (tracks.hasNextPage && !tracks.isFetchingNextPage) void tracks.fetchNextPage();
      }}
      renderItem={({ item, index }) => (
        <FadeRow entering={fade(index)}>
          <TrackRow
            track={item}
            art
            active={item.Id === currentId}
            playing={playing}
            onPress={() => usePlayer.getState().playQueue(items, { startIndex: index, source: { type: 'tracks', name: 'Your songs' } })}
          />
        </FadeRow>
      )}
    />
  );
}
