import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { matchesSearch, useItem, usePlaylistItems } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { formatLength, songCount, ticksToSeconds } from '@/lib/format';
import { useOffline } from '@/lib/online';
import { usePlayer } from '@/player/store';
import { Artwork } from '@/ui/Artwork';
import { OfflineUnavailable } from '@/ui/OfflineUnavailable';
import { StickyTitleBar, useScrollY } from '@/ui/CollapsingHeader';
import { BackButton, CollectionHeader } from '@/ui/CollectionHeader';
import { DownloadButton } from '@/ui/DownloadButton';
import { FindBar } from '@/ui/FindBar';
import { openMenu } from '@/ui/overlays';
import { PlaylistEditor } from '@/ui/PlaylistEditor';
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
  const [editing, setEditing] = useState(false);
  const [find, setFind] = useState('');
  const offline = useOffline();
  const { y, onScroll } = useScrollY();

  const p = playlist.data ?? undefined;
  const list = items.data ?? [];
  const seconds = list.reduce((sum, x) => sum + ticksToSeconds(x.RunTimeTicks), 0);
  const source = { type: 'playlist' as const, id, name: p?.Name ?? 'Playlist' };
  // Find in playlist: the songs shown; playing one still plays the whole playlist from there.
  const shown = find.trim() ? list.filter((x) => matchesSearch(x, find.trim())) : list;

  // Offline and not downloaded.
  if (playlist.data === null) return <OfflineUnavailable />;

  if (playlist.error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg, alignItems: 'center', justifyContent: 'center', padding: t.space.xl }}>
        <T variant="heading">This playlist no longer exists</T>
        <BackButton onPress={() => router.back()} />
      </View>
    );
  }

  if (editing && p) return <PlaylistEditor playlist={p} items={list} onDone={() => setEditing(false)} />;

  const header = (
    <View>
      <CollectionHeader
        art={<Artwork item={p} size={232} />}
        tint={artColor(p && client?.blurhash(p))}
        title={p?.Name ?? ' '}
        lines={[
          'Playlist',
          list.length ? `${songCount(list.length)}, ${formatLength(seconds)}` : '',
        ]}
        playing={isThis && playing}
        onPlay={() => {
          if (isThis) return usePlayer.getState().toggle();
          if (list.length) usePlayer.getState().playQueue(list, { source });
        }}
        onShuffle={() => list.length && usePlayer.getState().playQueue(list, { source, shuffle: true })}
        onMore={p ? () => openMenu(p) : undefined}
        onEdit={p && list.length && !offline ? () => setEditing(true) : undefined}
        scrollY={y}
        download={p && list.length ? <DownloadButton kind="playlist" item={p} /> : undefined}
      />
      {list.length > 1 ? <FindBar value={find} onChange={setFind} placeholder="Find in playlist" /> : null}
      {items.isLoading ? <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} /> : null}
      {find.trim() && !shown.length ? (
        <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
          {`Nothing in this playlist matches “${find.trim()}”`}
        </T>
      ) : null}
      {!items.isLoading && list.length === 0 ? (
        <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
          This playlist is empty. Long-press any song and choose Add to playlist.
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
        keyExtractor={(x, i) => x.PlaylistItemId ?? `${x.Id}-${i}`}
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
            onLongPress={() => openMenu(item, { playlistId: id, entryId: item.PlaylistItemId })}
          />
        )}
      />
      <StickyTitleBar y={y} title={p?.Name ?? ''} color={t.tint(artColor(p && client?.blurhash(p)))} />
      <BackButton onPress={() => router.back()} />
    </View>
  );
}
