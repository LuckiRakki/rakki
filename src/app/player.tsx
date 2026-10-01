import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRoutePicker } from '../../modules/rakki-audio';
import { HeartButton } from '@/ui/HeartButton';
import { thud, tick } from '@/lib/haptics';
import { useMusicVideos } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { localArtUri } from '@/downloads/store';
import { artColor } from '@/lib/blurhash';
import { artistLine } from '@/lib/items';
import { LyricsCard } from '@/lyrics/LyricsCard';
import { CreditsCard } from '@/player/CreditsCard';
import { SeekBar } from '@/player/SeekBar';
import { sleepSheet, useSleepLabel } from '@/player/sleep';
import { usePlayer } from '@/player/store';
import { useProgress } from '@/player/useProgress';
import { ArtistLinks } from '@/ui/ArtistLinks';
import { Artwork } from '@/ui/Artwork';
import { openAlbum } from '@/ui/nav';
import { openAddToPlaylist, openMenu, openOptions } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { findVideoFor, playMusicVideo } from '@/video/musicVideos';
import { useOnAir } from '@/radio/live';
import { RadioCard } from '@/radio/RadioCard';

const RoutePicker = getRoutePicker();

function tap(fn: () => void) {
  return () => {
    tick();
    fn();
  };
}

export default function PlayerScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // The player fills the sheet; the lyrics card waits below it, like Spotify.
  const [pageHeight, setPageHeight] = useState(height);
  const client = useAuth((s) => s.client);
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const source = usePlayer((s) => s.source);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const error = usePlayer((s) => s.error);
  const { position, duration } = useProgress(250);
  const sleepLabel = useSleepLabel();
  const videos = useMusicVideos();
  const video = track && videos.data ? findVideoFor(track, videos.data) : undefined;
  // A radio station: live, so no seeking, skipping, liking or queue.
  const stationId = track?.Radio?.stationId;
  const onAir = useOnAir((s) => (stationId ? s.byStation[stationId] : undefined));
  const radio = !!stationId;

  if (!track) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <T variant="caption">Nothing playing</T>
      </View>
    );
  }

  const tint = artColor(client?.blurhash(track));
  const playerBackground = t.appearance.playerBackground;
  const artUri = playerBackground === 'blur' ? (localArtUri(track.AlbumId ?? track.Id) ?? client?.imageUrl(track, 600)) : undefined;
  const art = Math.min(width - t.space.xl * 2, 420);
  const favorite = track.UserData?.IsFavorite ?? false;
  const p = usePlayer.getState;

  return (
    <View style={styles.root} onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}>
      {playerBackground === 'gradient' ? (
        <LinearGradient colors={[t.tint(tint), '#101010']} locations={[0, 0.85]} style={StyleSheet.absoluteFill} />
      ) : playerBackground === 'blur' ? (
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xl }}>
        <View style={{ height: pageHeight, paddingTop: insets.top + t.space.sm, paddingBottom: insets.bottom + t.space.md, paddingHorizontal: t.space.xl }}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable hitSlop={12} onPress={() => router.back()}>
              <Ionicons name="chevron-down" size={28} color={t.colors.text} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center', marginHorizontal: t.space.md }}>
              <T variant="label" color={t.colors.textSecondary} style={{ fontSize: t.size(10) }}>
                {source ? `Playing from ${source.type === 'tracks' ? 'your selection' : source.type}` : 'Now playing'}
              </T>
              <T numberOfLines={1} style={{ fontFamily: t.fonts.bold, fontSize: t.size(13) }}>
                {source?.name ?? track.Album ?? ''}
              </T>
            </View>
            {radio ? (
              <View style={{ width: 24 }} />
            ) : (
              <Pressable hitSlop={12} onPress={() => openMenu(track, { fromPlayer: true })}>
                <Ionicons name="ellipsis-horizontal" size={24} color={t.colors.text} />
              </Pressable>
            )}
          </View>

          {/* Artwork */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Artwork item={track} size={art} rounded={t.radius.card} style={styles.artShadow} />
          </View>

          {/* Title + like */}
          <View style={styles.titleRow}>
            <View style={{ flex: 1, marginRight: t.space.md }}>
              <T
                numberOfLines={1}
                onPress={track.AlbumId ? () => openAlbum(track.AlbumId!) : undefined}
                suppressHighlighting
                style={{ fontFamily: t.fonts.bold, fontSize: t.size(22) }}>
                {track.Name}
              </T>
              <ArtistLinks
                artists={track.ArtistItems}
                fallback={artistLine(track)}
                variant="caption"
                numberOfLines={1}
                style={{ fontSize: t.size(16), marginTop: 2 }}
              />
            </View>
            {radio ? null : (
              <HeartButton
                liked={favorite}
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
              <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(12), color: t.colors.accent }}>LIVE</T>
              <T variant="caption" numberOfLines={1} style={{ flex: 1, marginLeft: t.space.sm }}>
                {onAir?.show ? (onAir.dj ? `${onAir.show} with ${onAir.dj}` : onAir.show) : (source?.name ?? '')}
              </T>
            </View>
          ) : (
            <SeekBar position={position} duration={duration} onSeek={(s) => p().seek(s)} />
          )}

          {/* Transport */}
          {radio ? (
            <View style={[styles.controls, { justifyContent: 'center' }]}>
              <Pressable onPress={tap(() => p().toggle())} style={styles.playBtn} accessibilityLabel={playing ? 'Pause' : 'Play'}>
                {buffering ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Ionicons name={playing ? 'pause' : 'play'} size={34} color="#000" style={{ marginLeft: playing ? 0 : 4 }} />
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.controls}>
              <Pressable hitSlop={10} onPress={tap(() => p().toggleShuffle())}>
                <Ionicons name="shuffle" size={26} color={shuffle ? t.colors.accent : t.colors.text} />
                {shuffle ? <View style={styles.dot} /> : null}
              </Pressable>
              <Pressable hitSlop={10} onPress={tap(() => p().previous())}>
                <Ionicons name="play-skip-back" size={34} color={t.colors.text} />
              </Pressable>
              <Pressable onPress={tap(() => p().toggle())} style={styles.playBtn}>
                {buffering ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Ionicons name={playing ? 'pause' : 'play'} size={34} color="#000" style={{ marginLeft: playing ? 0 : 4 }} />
                )}
              </Pressable>
              <Pressable hitSlop={10} onPress={tap(() => p().next())}>
                <Ionicons name="play-skip-forward" size={34} color={t.colors.text} />
              </Pressable>
              <Pressable hitSlop={10} onPress={tap(() => p().cycleRepeat())}>
                <Ionicons name="repeat" size={26} color={repeat !== 'off' ? t.colors.accent : t.colors.text} />
                {repeat === 'one' ? (
                  <T style={styles.repeatOne}>1</T>
                ) : repeat === 'all' ? (
                  <View style={styles.dot} />
                ) : null}
              </Pressable>
            </View>
          )}

          {error ? (
            <T variant="caption" color={t.colors.danger} style={{ textAlign: 'center', marginBottom: t.space.sm }}>
              {error}
            </T>
          ) : null}

          {/* Output + queue */}
          <View style={styles.bottomRow}>
            {RoutePicker ? (
              <RoutePicker style={{ width: 30, height: 30 }} tintColor={t.colors.text} activeTintColor={t.colors.accent} />
            ) : (
              <Ionicons name="phone-portrait-outline" size={22} color={t.colors.textMuted} />
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
              <Pressable hitSlop={12} onPress={() => router.push('/lyrics')} style={styles.lyricsBtn}>
                <Ionicons name="mic" size={18} color="#000" />
                <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(13), color: '#000' }}>Lyrics</T>
              </Pressable>
              {video ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => void playMusicVideo(video)}
                  accessibilityLabel="Watch the music video"
                  style={styles.videoBtn}>
                  <Ionicons name="film-outline" size={17} color={t.colors.text} />
                  <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(13) }}>Video</T>
                </Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
              {sleepLabel ? (
                <Pressable
                  hitSlop={8}
                  accessibilityLabel={`Sleep timer: ${sleepLabel}`}
                  onPress={() => openOptions(sleepSheet(true))}
                  style={styles.sleepPill}>
                  <Ionicons name="moon" size={13} color={t.colors.accent} />
                  <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(12), color: t.colors.accent }}>{sleepLabel}</T>
                </Pressable>
              ) : null}
              {radio ? null : (
                <Pressable hitSlop={12} onPress={() => router.push('/queue')}>
                  <Ionicons name="list" size={26} color={t.colors.text} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
        <View style={{ paddingHorizontal: t.space.lg }}>
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
  root: { flex: 1, backgroundColor: '#101010' },
  header: { flexDirection: 'row', alignItems: 'center', height: 44 },
  artShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.md },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: t.space.md,
    marginBottom: t.space.lg,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: t.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.colors.accent,
  },
  repeatOne: {
    position: 'absolute',
    top: -4,
    right: -6,
    fontFamily: t.fonts.black,
    fontSize: t.size(10),
    color: t.colors.accent,
  },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, marginBottom: t.space.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.accent },
  sleepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.accent,
  },
  lyricsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.text,
  },
  videoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
}));
