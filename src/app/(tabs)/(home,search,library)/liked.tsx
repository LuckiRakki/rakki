import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { matchesSearch, useLikedSongs } from '@/api/queries';
import { withAlpha } from '@/lib/color';
import { formatLength, songCount, ticksToSeconds } from '@/lib/format';
import { usePlayer } from '@/player/store';
import { StickyTitleBar, useScrollY } from '@/ui/CollapsingHeader';
import { BackButton, CollectionHeader } from '@/ui/CollectionHeader';
import { DownloadButton } from '@/ui/DownloadButton';
import { FindBar } from '@/ui/FindBar';
import { LikedArt } from '@/ui/LikedArt';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

const LIKED = { Id: 'liked', Name: 'Liked Songs', Type: 'Playlist' };

export default function LikedSongsScreen() {
  const t = useTheme();
  const { y, onScroll } = useScrollY();
  const liked = useLikedSongs();
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const playing = usePlayer((s) => s.playing);
  const isThis = usePlayer((s) => s.source?.type === 'playlist' && s.source.id === 'liked');
  const list = liked.data ?? [];
  const source = { type: 'playlist' as const, id: 'liked', name: 'Liked Songs' };
  const [find, setFind] = useState('');
  // Find in Liked Songs: the songs shown; playing one still plays them all from there.
  const shown = find.trim() ? list.filter((x) => matchesSearch(x, find.trim())) : list;
  const seconds = list.reduce((sum, x) => sum + ticksToSeconds(x.RunTimeTicks), 0);

  const header = (
    <View>
      <CollectionHeader
        scrollY={y}
        art={<LikedArt size={232} />}
        tint={withAlpha(t.colors.accent, 0.55)}
        title="Liked Songs"
        lines={['Playlist', list.length ? `${songCount(list.length)}, ${formatLength(seconds)}` : '']}
        playing={isThis && playing}
        onPlay={() => {
          if (isThis) return usePlayer.getState().toggle();
          if (list.length) usePlayer.getState().playQueue(list, { source });
        }}
        onShuffle={() => list.length && usePlayer.getState().playQueue(list, { source, shuffle: true })}
        download={list.length ? <DownloadButton kind="liked" item={LIKED} /> : undefined}
      />
      {list.length > 1 ? <FindBar value={find} onChange={setFind} placeholder="Find in Liked Songs" /> : null}
      {liked.isLoading ? <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} /> : null}
      {find.trim() && !shown.length ? (
        <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
          {`Nothing in Liked Songs matches “${find.trim()}”`}
        </T>
      ) : null}
      {!liked.isLoading && list.length === 0 ? (
        <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
          Songs you like will appear here. Tap the heart on any song.
        </T>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Animated.FlatList
        onScroll={onScroll}
        scrollEventThrottle={16}
        data={shown}
        keyExtractor={(x) => x.Id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: t.space.xl }}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            art
            active={item.Id === currentId}
            playing={playing}
            onPress={() => usePlayer.getState().playQueue(list, { startIndex: shown === list ? index : list.indexOf(item), source })}
          />
        )}
      />
      <StickyTitleBar y={y} title="Liked Songs" color={t.tint(t.colors.accent)} />
      <BackButton onPress={() => router.back()} />
    </View>
  );
}
