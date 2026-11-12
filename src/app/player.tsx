import { Ionicons } from '@/ui/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRoutePicker } from '../../modules/rakki-audio';
import type { BaseItem } from '@/api/jellyfin';
import { Glass } from '@/ui/Glass';
import { HeartButton } from '@/ui/HeartButton';
import { thud, tick } from '@/lib/haptics';
import { useMusicVideos } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { useInAnyPlaylist } from '@/library/playlistCache';
import { localArtUri } from '@/downloads/store';
import { artColor } from '@/lib/blurhash';
import { artistLine } from '@/lib/items';
import { LyricsCard } from '@/lyrics/LyricsCard';
import { CreditsCard } from '@/player/CreditsCard';
import { SwipeCover } from '@/player/SwipeCover';
import { PlayButton } from '@/player/PlayButton';
import { SeekBar } from '@/player/SeekBar';
import { sleepSheet, useSleepLabel } from '@/player/sleep';
import { useRemoteProgress, useRemoteTarget } from '@/player/remoteTarget';
import { usePlayer, type QueueSource } from '@/player/store';
import type { RakkiDevice } from '@/remote/devices';
import { Artwork } from '@/ui/Artwork';
import { useProgress } from '@/player/useProgress';
import { ArtistLinks } from '@/ui/ArtistLinks';
import { Marquee } from '@/ui/Marquee';
import { Slider } from '@/ui/Slider';
import { openAlbum } from '@/ui/nav';
import { openAddToPlaylist, openMenu, openOptions } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { findVideoFor, playMusicVideo } from '@/video/musicVideos';
import { useOnAir } from '@/radio/live';
import { RadioCard } from '@/radio/RadioCard';
import { stationWebsite, useStations } from '@/radio/stations';
import { FlowingCover } from '@/spicy/Backdrop';
import { openStationWebsite } from '@/radio/StationViews';
import { useInBackground } from '@/lib/appActive';

const RoutePicker = getRoutePicker();

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

async function shareTrack(track: BaseItem) {
  const by = artistLine(track);
  try {
    await Share.share({ message: by ? `${track.Name} by ${by}` : track.Name });
  } catch {
    // Dismissed or unavailable: nothing to do.
  }
}


function tap(fn: () => void) {
  return () => {
    tick();
    fn();
  };
}

/** This phone's player, or the device it controls (player/remoteTarget.ts). */
export default function PlayerScreen() {
  const target = useRemoteTarget((s) => s.target);
  return target ? <RemotePlayer target={target} /> : <LocalPlayer />;
}

/**
 * Another Rakki's song, like Spotify's Connect player: its cover, title and place, with buttons
 * that command it, its volume when it takes volume commands, and "Listening on {device}" at the
 * bottom (tap for Connect to move it back).
 */
function RemotePlayer({ target }: { target: RakkiDevice }) {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const client = useAuth((s) => s.client);
  const { position, duration } = useRemoteProgress(250);
  const item = target.item;
  const r = useRemoteTarget.getState;
  const art = Math.min(width - t.space.xl * 2, 420);
  const tint = artColor(item ? client?.blurhash(item) : undefined);
  // The server's session doesn't say whether you liked the song: ask for it.
  const full = useQuery({
    queryKey: ['remoteItem', item?.Id],
    queryFn: () => client!.getItem(item!.Id),
    enabled: !!client && !!item,
    staleTime: 60_000,
  }).data;
  const [liked, setLiked] = useState<{ id: string; v: boolean } | null>(null);
  const favorite = item ? (liked?.id === item.Id ? liked.v : (full?.UserData?.IsFavorite ?? item.UserData?.IsFavorite ?? false)) : false;
  const inPlaylist = useInAnyPlaylist(item?.Id);
  return (
    <View style={styles.root}>
      <LinearGradient colors={[t.tint(tint), '#101010']} locations={[0, 0.85]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: insets.top + t.space.sm, paddingBottom: insets.bottom + t.space.md, paddingHorizontal: t.space.xl }}>
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
            <Ionicons name="chevron-down" size={28} color={t.colors.text} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', marginHorizontal: t.space.md }}>
            <T variant="label" color={t.colors.textSecondary} style={{ fontSize: t.size(10) }}>
              Playing On
            </T>
            <T numberOfLines={1} style={{ fontFamily: t.fonts.bold, fontSize: t.size(13) }}>
              {target.name}
            </T>
          </View>
          {item ? (
            <Pressable hitSlop={12} onPress={() => openMenu(full ?? item)} accessibilityLabel="More">
              <Ionicons name="ellipsis-horizontal" size={24} color={t.colors.text} />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {item ? (
            <Artwork item={item} size={art} style={styles.artShadow} />
          ) : (
            <T variant="caption">Nothing playing on {target.name}</T>
          )}
        </View>

        {item ? (
          <>
            <View style={styles.titleRow}>
              <View style={{ flex: 1, marginRight: t.space.md }}>
                <Pressable disabled={!item.AlbumId} onPress={() => item.AlbumId && openAlbum(item.AlbumId)}>
                  <Marquee text={item.Name} style={styles.title} />
                </Pressable>
                <ArtistLinks artists={item.ArtistItems} fallback={artistLine(item)} variant="caption" numberOfLines={1} style={styles.artist} />
              </View>
              <HeartButton
                liked={favorite}
                inPlaylist={inPlaylist}
                onToggle={(v) => {
                  setLiked({ id: item.Id, v });
                  usePlayer.getState().setFavorite(item.Id, v);
                }}
                onLongPress={() => {
                  thud();
                  openAddToPlaylist([full ?? item], item.Name);
                }}
              />
            </View>
            <SeekBar position={position} duration={duration} onSeek={(s) => r().seek(s)} />
            <View style={[styles.controls, { justifyContent: 'center', gap: t.space.xxl }]}>
              <Pressable hitSlop={10} onPress={tap(() => r().command('PreviousTrack'))} accessibilityLabel="Previous">
                <Ionicons name="play-skip-back" size={34} color={t.colors.text} />
              </Pressable>
              <PlayButton playing={!target.paused} onPress={tap(() => r().command('PlayPause'))} />
              <Pressable hitSlop={10} onPress={tap(() => r().command('NextTrack'))} accessibilityLabel="Next">
                <Ionicons name="play-skip-forward" size={34} color={t.colors.text} />
              </Pressable>
            </View>
          </>
        ) : null}

        {target.commands.includes('SetVolume') ? (
          <View style={styles.volumeRow} accessibilityLabel={`${target.name}'s volume`}>
            <Ionicons name="volume-low" size={20} color={t.colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Slider value={target.volume ?? 80} min={0} max={100} step={1} onChange={(v) => r().volume(v)} />
            </View>
            <Ionicons name="volume-high" size={20} color={t.colors.textSecondary} />
          </View>
        ) : null}

        <Pressable onPress={() => router.push('/devices')} accessibilityRole="button" accessibilityLabel={`Listening on ${target.name}. Open Connect`} style={styles.listeningOn}>
          <Ionicons name="laptop-outline" size={18} color={t.colors.accentText} />
          <T numberOfLines={1} style={{ fontFamily: t.fonts.bold, fontSize: t.size(13), color: t.colors.accentText, flexShrink: 1 }}>
            Listening on {target.name}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

function LocalPlayer() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const away = useInBackground();
  const { width, height } = useWindowDimensions();
  // The player fills the sheet; the lyrics card waits below it, like Spotify.
  const [pageHeight, setPageHeight] = useState(height);
  const client = useAuth((s) => s.client);
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
  const sleepLabel = useSleepLabel();
  const videos = useMusicVideos();
  const video = track && videos.data ? findVideoFor(track, videos.data) : undefined;
  // A radio station: live, so no seeking, skipping, liking or queue.
  const stationId = track?.Radio?.stationId;
  const onAir = useOnAir((s) => (stationId ? s.byStation[stationId] : undefined));
  const radio = !!stationId;
  const station = useStations((s) => (stationId ? s.stations.find((x) => x.id === stationId) : undefined));
  // Plain streams have no song info, so no lyrics either (SUB/WAVE stations do).
  const plainRadio = !!station && !station.apiBase;

  if (!track) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <T variant="caption">Nothing playing</T>
      </View>
    );
  }

  const tint = artColor(client?.blurhash(track));
  const playerBackground = t.appearance.playerBackground;
  // Blurred anyway, so a small cover does (the moving one's even smaller: three copies move).
  const artUri =
    playerBackground === 'blur' || playerBackground === 'moving'
      ? (localArtUri(track.AlbumId ?? track.Id) ?? client?.imageUrl(track, playerBackground === 'moving' ? 300 : 600))
      : undefined;
  const art = Math.min(width - t.space.xl * 2, 420);
  const favorite = track.UserData?.IsFavorite ?? false;
  const p = usePlayer.getState;

  return (
    <View style={styles.root} onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}>
      {playerBackground === 'moving' ? (
        // The cover's colours flowing slowly behind everything (still with reduced motion).
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.tint(tint), overflow: 'hidden' }]} pointerEvents="none">
          <FlowingCover uri={artUri} motion={t.reduceMotion ? 0 : t.appearance.playerMotion} />
          {/* The full-screen blur keeps big buffers; in the background only the colour stays. */}
          {away ? null : (
            <>
              <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.6)']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
            </>
          )}
        </View>
      ) : playerBackground === 'gradient' ? (
        <LinearGradient colors={[t.tint(tint), '#101010']} locations={[0, 0.85]} style={StyleSheet.absoluteFill} />
      ) : playerBackground === 'blur' && !away ? (
        <View style={StyleSheet.absoluteFill}>
          <Image
            source={artUri ? { uri: artUri } : undefined}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={60}
            cachePolicy="memory-disk"
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        </View>
      ) : null}
      {t.glass.kind === 'clear' ? (
        // Clear glass has no panel: a dark fade under the controls keeps them readable.
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.52)', 'rgba(0,0,0,0.62)']}
          locations={[0, 0.46, 1]}
          style={[StyleSheet.absoluteFill, { top: '45%' }]}
        />
      ) : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xl }}>
        {/* The player fills the page but for a peek of the lyrics card below it (Maneki). */}
        <View style={{ height: pageHeight - PEEK, paddingTop: insets.top + t.space.sm, paddingBottom: t.space.md, paddingHorizontal: t.space.xl }}>
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

            {/* The device chip on the left (Connect), the rest on the right. */}
            <View style={styles.bottomRow}>
              <Pressable onPress={() => router.push('/devices')} accessibilityLabel="Playing on This iPhone. Change Device" style={styles.deviceChip}>
                <Ionicons name="phone-portrait-outline" size={16} color={t.colors.text} />
                <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(13) }}>This iPhone</T>
              </Pressable>
              <View style={styles.side}>
                {sleepLabel ? (
                  <Pressable hitSlop={8} accessibilityLabel={`Sleep Timer: ${sleepLabel}`} onPress={() => openOptions(sleepSheet(true))} style={styles.sleepPill}>
                    <Ionicons name="moon" size={13} color={t.colors.accentText} />
                    <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(12), color: t.colors.accentText }}>{sleepLabel}</T>
                  </Pressable>
                ) : null}
                {video ? (
                  <Pressable hitSlop={8} onPress={() => void playMusicVideo(video)} accessibilityLabel="Watch the Music Video" style={styles.iconBtn}>
                    <Ionicons name="film-outline" size={22} color={t.colors.textSecondary} />
                  </Pressable>
                ) : null}
                {plainRadio || t.appearance.lyricsCard ? null : (
                  <Pressable hitSlop={8} onPress={() => router.push('/lyrics')} accessibilityLabel="Lyrics" style={styles.iconBtn}>
                    <Ionicons name="mic-outline" size={22} color={t.colors.textSecondary} />
                  </Pressable>
                )}
                {RoutePicker ? (
                  <RoutePicker style={{ width: 36, height: 36 }} tintColor={t.colors.textSecondary} activeTintColor={t.colors.accentText} />
                ) : null}
                <Pressable hitSlop={8} onPress={() => void shareTrack(track)} accessibilityLabel="Share" style={styles.iconBtn}>
                  <Ionicons name="share-outline" size={22} color={t.colors.textSecondary} />
                </Pressable>
                {radio ? null : (
                  <Pressable hitSlop={8} onPress={() => router.push('/queue')} accessibilityLabel="Queue" style={styles.iconBtn}>
                    <Ionicons name="list" size={24} color={t.colors.textSecondary} />
                  </Pressable>
                )}
              </View>
            </View>
          </Glass>
        </View>
        <View style={{ paddingHorizontal: 12 }}>
          {stationId ? (
            <RadioCard stationId={stationId} />
          ) : (
            <>
              {t.appearance.lyricsCard ? <LyricsCard track={track} positionSec={position} /> : null}
              <CreditsCard track={track} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', height: 44 },
  artShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 24 },
  },
  sheet: { marginHorizontal: 12 - t.space.xl, marginTop: 20, paddingTop: 18, paddingHorizontal: 12, paddingBottom: 6, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  title: { fontFamily: t.fonts.black, fontSize: t.size(26), letterSpacing: -0.3 },
  artist: { fontFamily: t.fonts.semibold, fontSize: t.size(17), color: t.colors.accentText, marginTop: 3 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side44: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.colors.accent,
  },
  repeatOne: {
    position: 'absolute',
    top: 2,
    right: 0,
    fontFamily: t.fonts.black,
    fontSize: t.size(10),
    color: t.colors.accentText,
  },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, marginTop: t.space.lg },
  listeningOn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: t.space.sm },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  side: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  deviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.accent },
  sleepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.accentText,
  },
}));
