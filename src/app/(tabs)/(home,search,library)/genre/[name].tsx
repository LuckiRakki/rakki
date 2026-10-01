import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, useWindowDimensions, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { useGenreAlbums, useGenreArtists, useGenreCounts, useGenreTopTracks } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { withAlpha } from '@/lib/color';
import { usePlayer } from '@/player/store';
import { ItemTile } from '@/ui/AlbumTile';
import { Artwork } from '@/ui/Artwork';
import { BackButton, CollectionHeader } from '@/ui/CollectionHeader';
import { useGenreColor } from '@/ui/GenreTile';
import { SectionTitle, Shelf } from '@/ui/Shelf';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

const COVER = 216;

/** Four albums from the genre in a square, like a Spotify genre playlist cover. */
function Mosaic({ albums, color }: { albums: BaseItem[]; color: string }) {
  const t = useTheme();
  const cells = albums.filter((a) => a.ImageTags?.Primary).slice(0, 4);
  if (cells.length < 4) {
    return cells[0] ? (
      <Artwork item={cells[0]} size={COVER} />
    ) : (
      <View style={{ width: COVER, height: COVER, borderRadius: t.radius.art, backgroundColor: color }} />
    );
  }
  return (
    <View style={{ width: COVER, height: COVER, flexDirection: 'row', flexWrap: 'wrap', borderRadius: t.radius.art, overflow: 'hidden' }}>
      {cells.map((a) => (
        <Artwork key={a.Id} item={a} size={COVER / 2} rounded={0} />
      ))}
    </View>
  );
}

export default function GenreScreen() {
  const { name = '' } = useLocalSearchParams<{ name: string }>();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const genre = useGenreCounts().data?.find((g) => g.name === name);
  const color = useGenreColor(genre, name);
  const albums = useGenreAlbums(name);
  const artists = useGenreArtists(name);
  const top = useGenreTopTracks(name);
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const playing = usePlayer((s) => s.playing);
  const isThis = usePlayer((s) => s.source?.type === 'genre' && s.source.id === name);
  const [busy, setBusy] = useState(false);

  const albumList = albums.data ?? [];
  const topList = top.data ?? [];
  const source = { type: 'genre' as const, id: name, name };

  // Artists with the most albums in this genre first.
  const albumCount = new Map<string, number>();
  for (const a of albumList) for (const x of a.AlbumArtists ?? []) albumCount.set(x.Id, (albumCount.get(x.Id) ?? 0) + 1);
  const artistList = [...(artists.data ?? [])].sort((a, b) => (albumCount.get(b.Id) ?? 0) - (albumCount.get(a.Id) ?? 0));

  async function play(shuffle: boolean) {
    const client = useAuth.getState().client;
    if (!client || busy) return;
    if (!shuffle && isThis) return usePlayer.getState().toggle();
    setBusy(true);
    try {
      const tracks = (await client.getGenreTracks(name)).Items;
      if (tracks.length) usePlayer.getState().playQueue(tracks, { source, shuffle });
    } finally {
      setBusy(false);
    }
  }

  const gap = t.space.lg;
  const columns = t.appearance.gridColumns;
  const tile = Math.floor((width - t.space.lg * 2 - gap * (columns - 1)) / columns);

  const header = (
    <View>
      <CollectionHeader
        art={<Mosaic albums={albumList} color={color} />}
        tint={withAlpha(color, 0.9)}
        title={name}
        lines={[
          'Genre',
          [
            genre ? `${genre.count} album${genre.count === 1 ? '' : 's'}` : '',
            artistList.length ? `${artistList.length} artist${artistList.length === 1 ? '' : 's'}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        ]}
        playing={isThis && playing}
        onPlay={() => void play(false)}
        onShuffle={() => void play(true)}
      />
      {topList.length ? (
        <View style={{ marginTop: t.space.lg }}>
          <SectionTitle title="Your top songs" />
          {topList.map((track, i) => (
            <TrackRow
              key={track.Id}
              track={track}
              art
              rank={i + 1}
              active={track.Id === currentId}
              playing={playing}
              onPress={() => usePlayer.getState().playQueue(topList, { startIndex: i, source })}
            />
          ))}
        </View>
      ) : null}
      <Shelf title="Artists" items={artistList} size={120} />
      {albumList.length ? (
        <View style={{ marginTop: t.space.xl }}>
          <SectionTitle title="Albums" />
        </View>
      ) : null}
      {albums.isLoading ? <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} /> : null}
      {!albums.isLoading && albumList.length === 0 ? (
        <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
          Nothing in your library is tagged {name} anymore.
        </T>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        data={albumList}
        keyExtractor={(a) => a.Id}
        key={`genre-albums-${columns}`}
        numColumns={columns}
        columnWrapperStyle={{ gap, paddingHorizontal: t.space.lg }}
        contentContainerStyle={{ gap: t.space.xl, paddingBottom: t.space.xl }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <ItemTile item={item} size={tile} />}
      />
      <BackButton onPress={() => router.back()} />
    </View>
  );
}
