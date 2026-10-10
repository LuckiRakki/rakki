import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { BaseItem } from '@/api/jellyfin';
import { matchesSearch, useItem, usePlaylistItems } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { formatLength, songCount, ticksToSeconds } from '@/lib/format';
import { useOffline } from '@/lib/online';
import { noteLoadedPlaylist } from '@/library/playlistCache';
import { toggleShuffleFor, usePlayer } from '@/player/store';
import { Artwork } from '@/ui/Artwork';
import { OfflineUnavailable } from '@/ui/OfflineUnavailable';
import { StickyTitleBar, useScrollY } from '@/ui/CollapsingHeader';
import { BackButton, CollectionHeader } from '@/ui/CollectionHeader';
import { DownloadButton } from '@/ui/DownloadButton';
import { FindBar } from '@/ui/FindBar';
import { openMenu, openOptions } from '@/ui/overlays';
import { readPref, writePref } from '@/lib/prefs';
import { seededShuffle } from '@/library/view';
import { PlaylistEditor } from '@/ui/PlaylistEditor';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

type PlaylistSort = 'custom' | 'recent' | 'title' | 'artist' | 'album' | 'length' | 'random';

const PLAYLIST_SORTS: { key: PlaylistSort; label: string }[] = [
  { key: 'custom', label: 'Custom order' },
  { key: 'recent', label: 'Recently added' },
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
  { key: 'length', label: 'Length' },
  { key: 'random', label: 'Random' },
];

const SORT_KEY = 'rakki.playlistSort';

/**
 * The playlist in a chosen order. Jellyfin adds new songs to the end and doesn't keep when,
 * so Recently added is the playlist backwards.
 */
function sortPlaylist(list: BaseItem[], key: PlaylistSort, seed: number): BaseItem[] {
  const by = (get: (x: BaseItem) => string) =>
    [...list].sort((a, b) => get(a).localeCompare(get(b), undefined, { sensitivity: 'base' }));
  switch (key) {
    case 'recent':
      return [...list].reverse();
    case 'title':
      return by((x) => x.Name);
    case 'artist':
      return by((x) => `${x.Artists?.[0] ?? x.AlbumArtist ?? ''} ${x.Album ?? ''}`);
    case 'album':
      return by((x) => `${x.Album ?? ''} ${String(x.IndexNumber ?? 0).padStart(3, '0')}`);
    case 'length':
      return [...list].sort((a, b) => (a.RunTimeTicks ?? 0) - (b.RunTimeTicks ?? 0));
    case 'random':
      return seededShuffle(list, seed);
    default:
      return list;
  }
}

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const client = useAuth((s) => s.client);
  const playlist = useItem(id);
  const items = usePlaylistItems(id);
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const playing = usePlayer((s) => s.playing);
  const isThis = usePlayer((s) => s.source?.type === 'playlist' && s.source.id === id);
  const shuffleOn = usePlayer((s) => s.shuffleMode);
  const [editing, setEditing] = useState(false);
  const [find, setFind] = useState('');
  const [sortKey, setSortKey] = useState<PlaylistSort>(() => (readPref(SORT_KEY) as PlaylistSort | null) ?? 'custom');
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const offline = useOffline();
  const { y, onScroll } = useScrollY();
  // A fresh full list from the server also refreshes the playlist cache (not offline: then it's
  // only the downloaded songs).
  useEffect(() => {
    if (!offline && items.data && id) noteLoadedPlaylist(id, items.data, items.dataUpdatedAt);
  }, [offline, id, items.data, items.dataUpdatedAt]);

  const p = playlist.data ?? undefined;
  const list = items.data ?? [];
  const seconds = list.reduce((sum, x) => sum + ticksToSeconds(x.RunTimeTicks), 0);
  const source = { type: 'playlist' as const, id, name: p?.Name ?? 'Playlist' };
  // The playlist in the chosen order (Play follows it), then Find narrows down what's shown;
  // playing a found song still plays the whole (sorted) playlist from there.
  const ordered = sortPlaylist(list, sortKey, seed);
  const shown = find.trim() ? ordered.filter((x) => matchesSearch(x, find.trim())) : ordered;
  const chooseSort = () =>
    openOptions({
      title: 'Sort playlist',
      options: PLAYLIST_SORTS.map(({ key, label }) => ({ key, label })),
      selected: sortKey,
      onSelect: (key) => {
        writePref(SORT_KEY, key);
        setSortKey(key as PlaylistSort);
        if (key === 'random') setSeed(Date.now() % 100000);
      },
    });

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
          if (ordered.length) usePlayer.getState().playQueue(ordered, { source });
        }}
        onShuffle={() => toggleShuffleFor(isThis)}
        shuffleOn={shuffleOn}
        onMore={p ? () => openMenu(p) : undefined}
        onEdit={p && list.length && !offline ? () => setEditing(true) : undefined}
        scrollY={y}
        download={p && list.length ? <DownloadButton kind="playlist" item={p} /> : undefined}
      />
      {list.length > 1 ? <FindBar value={find} onChange={setFind} placeholder="Find in playlist" /> : null}
      {list.length > 1 ? (
        <Pressable
          hitSlop={8}
          onPress={chooseSort}
          accessibilityLabel={`Sort by ${PLAYLIST_SORTS.find((x) => x.key === sortKey)?.label}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.xs, alignSelf: 'flex-start', marginHorizontal: t.space.lg, marginBottom: t.space.sm }}>
          <Ionicons name="swap-vertical" size={16} color={t.colors.text} />
          <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(13) }}>{PLAYLIST_SORTS.find((x) => x.key === sortKey)?.label}</T>
        </Pressable>
      ) : null}
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
        windowSize={7}
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
            onPress={() => usePlayer.getState().playQueue(ordered, { startIndex: shown === ordered ? index : ordered.indexOf(item), source })}
            onLongPress={() => openMenu(item, { playlistId: id, entryId: item.PlaylistItemId })}
          />
        )}
      />
      <StickyTitleBar y={y} title={p?.Name ?? ''} color={t.tint(artColor(p && client?.blurhash(p)))} />
      <BackButton onPress={() => router.back()} />
    </View>
  );
}
