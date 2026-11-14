import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@/ui/Icon';
import { Glass } from '@/ui/Glass';
import { HeartButton } from '@/ui/HeartButton';
import { thud } from '@/lib/haptics';
import { useInAnyPlaylist } from '@/library/playlistCache';
import { artistLine } from '@/lib/items';
import { LyricsCard } from '@/lyrics/LyricsCard';
import { useNoLyrics } from '@/lyrics/LyricsStage';
import { CreditsCard } from '@/player/CreditsCard';
import { VisualizerCard } from '@/player/VisualizerCard';
import { SwipeCover } from '@/player/SwipeCover';
import { PlayButton } from '@/player/PlayButton';
import { SeekBar } from '@/player/SeekBar';
import { useRemoteTarget } from '@/player/remoteTarget';
import { usePlayer, type QueueSource } from '@/player/store';
import { useProgress } from '@/player/useProgress';
import { ArtistLinks } from '@/ui/ArtistLinks';
import { Marquee } from '@/ui/Marquee';
import { openAlbum } from '@/ui/nav';
import { openAddToPlaylist, openMenu } from '@/ui/overlays';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { useOnAir } from '@/radio/live';
import { RadioCard } from '@/radio/RadioCard';
import { stationWebsite, useStations } from '@/radio/stations';
import { openStationWebsite } from '@/radio/StationViews';
import { sheetTop, tap, usePlayerStyles } from '@/player/screen/styles';
import { RemotePlayer } from '@/player/screen/RemotePlayer';
import { PlayerBackdrop } from '@/player/screen/PlayerBackdrop';
import { PlayerActions } from '@/player/screen/PlayerActions';

/** How much of the lyrics card shows under the player before you scroll. */
const PEEK = 64;

/** "Playing from Album", in Title Case (DESIGN.md). */
const SOURCE_LABEL: Record<QueueSource['type'], string> = {
  album: 'Album',
  playlist: 'Playlist',
  artist: 'Artist',
  tracks: 'Your Selection',
  genre: 'Genre',
  search: 'Search',
  radio: 'Radio',
};

/** This phone's player, or the device it controls (player/remoteTarget.ts). */
export default function PlayerScreen() {
  const target = useRemoteTarget((s) => s.target);
  return target ? <RemotePlayer target={target} /> : <LocalPlayer />;
}

function LocalPlayer() {
  const t = useTheme();
  const styles = usePlayerStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // The player fills the sheet; the lyrics card waits below it, like Spotify.
  const [pageHeight, setPageHeight] = useState(height);
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const inPlaylist = useInAnyPlaylist(track?.Id);
  const source = usePlayer((s) => s.source);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const error = usePlayer((s) => s.error);
  // Only while it's the screen on top (the queue and the lyrics open over it).
  const focused = useIsFocused();
  const { position, duration } = useProgress(250, focused);
  // A radio station: live, so no seeking, skipping, liking or queue.
  const stationId = track?.Radio?.stationId;
  const onAir = useOnAir((s) => (stationId ? s.byStation[stationId] : undefined));
  const radio = !!stationId;
  const station = useStations((s) => (stationId ? s.stations.find((x) => x.id === stationId) : undefined));
  // Plain streams have no song info, so no lyrics either (SUB/WAVE stations do).
  const plainRadio = !!station && !station.apiBase;
  const noLyrics = useNoLyrics(track);

  if (!track) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <T variant="caption">Nothing playing</T>
      </View>
    );
  }

  const art = Math.min(width - t.space.xl * 2, 420);
  const favorite = track.UserData?.IsFavorite ?? false;
  const p = usePlayer.getState;

  return (
    <View style={styles.root} onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}>
      <PlayerBackdrop track={track} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xl }}>
        {/* The player fills the page but for a peek of the lyrics card below it (Maneki). */}
        <View style={{ height: pageHeight - PEEK, paddingTop: sheetTop(insets.top, t.space.xs), paddingBottom: t.space.md, paddingHorizontal: t.space.xl }}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close Player">
              <Ionicons name="chevron-down" size={28} color={t.colors.text} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center', marginHorizontal: t.space.md }}>
              <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(12), color: t.colors.textMuted }}>
                {source ? `Playing from ${SOURCE_LABEL[source.type] ?? 'Your Selection'}` : 'Now Playing'}
              </T>
              <T numberOfLines={1} style={{ fontFamily: t.fonts.bold, fontSize: t.size(14) }}>
                {source?.name ?? track.Album ?? ''}
              </T>
            </View>
            {radio ? (
              <View style={{ width: 24 }} />
            ) : (
              <Pressable hitSlop={12} onPress={() => openMenu(track, { fromPlayer: true })} accessibilityLabel="More">
                <Ionicons name="ellipsis-horizontal" size={24} color={t.colors.text} />
              </Pressable>
            )}
          </View>

          {/* Artwork */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <SwipeCover track={track} size={art} live={radio} style={styles.artShadow} />
          </View>

          {/* The glass sheet: title and heart, the clean bar, the transport, then device, share and queue. */}
          <Glass radius={28} style={styles.sheet}>
            <View style={styles.titleRow}>
              <View style={{ flex: 1, marginRight: t.space.md }}>
                <Pressable disabled={!track.AlbumId} onPress={() => track.AlbumId && openAlbum(track.AlbumId)}>
                  <Marquee text={track.Name} style={styles.title} />
                </Pressable>
                <ArtistLinks
                  artists={track.ArtistItems}
                  fallback={artistLine(track)}
                  variant="caption"
                  numberOfLines={1}
                  style={styles.artist}
                />
              </View>
              {radio ? (
                station && stationWebsite(station) ? (
                  <Pressable hitSlop={10} onPress={() => openStationWebsite(station)} accessibilityLabel={`Open ${station.name}'s website`}>
                    <Ionicons name="globe-outline" size={26} color={t.colors.text} />
                  </Pressable>
                ) : null
              ) : (
                <HeartButton
                  liked={favorite}
                  inPlaylist={inPlaylist}
                  size={28}
                  onToggle={(v) => p().setFavorite(track.Id, v)}
                  onLongPress={() => {
                    thud();
                    openAddToPlaylist([track], track.Name);
                  }}
                />
              )}
            </View>

            {radio ? (
              <View style={styles.live}>
                <View style={styles.liveDot} />
                <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(12), color: t.colors.accentText }}>LIVE</T>
                <T variant="caption" numberOfLines={1} style={{ flex: 1, marginLeft: t.space.sm }}>
                  {onAir?.show ? (onAir.dj ? `${onAir.show} with ${onAir.dj}` : onAir.show) : (source?.name ?? '')}
                </T>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 6 }}>
                <SeekBar position={position} duration={duration} onSeek={(s) => p().seek(s)} />
              </View>
            )}

            {/* Transport */}
            {radio ? (
              <View style={[styles.controls, { justifyContent: 'center' }]}>
                {/* Live: stop, not pause (play again picks it up live). */}
                <PlayButton playing={playing} buffering={buffering} live onPress={tap(() => p().toggle())} />
              </View>
            ) : (
              <View style={styles.controls}>
                <Pressable hitSlop={10} onPress={tap(() => p().toggleShuffle())} style={styles.side44} accessibilityLabel={shuffle ? 'Shuffle, On' : 'Shuffle'}>
                  <Ionicons name="shuffle" size={26} color={shuffle ? t.colors.accentText : t.colors.textSecondary} />
                  {shuffle ? <View style={styles.dot} /> : null}
                </Pressable>
                <Pressable hitSlop={10} onPress={tap(() => p().previous())} accessibilityLabel="Previous">
                  <Ionicons name="play-skip-back" size={40} color={t.colors.text} />
                </Pressable>
                <PlayButton playing={playing} buffering={buffering} onPress={tap(() => p().toggle())} />
                <Pressable hitSlop={10} onPress={tap(() => p().next())} accessibilityLabel="Next">
                  <Ionicons name="play-skip-forward" size={40} color={t.colors.text} />
                </Pressable>
                <Pressable hitSlop={10} onPress={tap(() => p().cycleRepeat())} style={styles.side44} accessibilityLabel={`Repeat, ${repeat === 'off' ? 'Off' : repeat === 'one' ? 'One' : 'On'}`}>
                  <Ionicons name="repeat" size={26} color={repeat !== 'off' ? t.colors.accentText : t.colors.textSecondary} />
                  {repeat === 'one' ? <T style={styles.repeatOne}>1</T> : repeat === 'all' ? <View style={styles.dot} /> : null}
                </Pressable>
              </View>
            )}

            {error ? (
              <T variant="caption" color={t.colors.danger} style={{ textAlign: 'center', marginBottom: t.space.sm }}>
                {error}
              </T>
            ) : null}

            <PlayerActions track={track} radio={radio} plainRadio={plainRadio} />
          </Glass>
        </View>
        <View style={{ paddingHorizontal: 12 }}>
          {stationId ? (
            <RadioCard stationId={stationId} />
          ) : (
            <>
              {t.appearance.lyricsCard ? <LyricsCard track={track} positionSec={position} /> : null}
              {noLyrics && t.appearance.noLyricsVisualizer ? <VisualizerCard /> : null}
              <CreditsCard track={track} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
