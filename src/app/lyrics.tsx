import { Ionicons } from '@/ui/Icon';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { localArtUri } from '@/downloads/store';
import { artColor } from '@/lib/blurhash';
import { useScreenAwake } from '@/lib/keepAwake';
import { useSwipeDown } from '@/ui/useSwipeDown';
import { artistLine } from '@/lib/items';
import { createPlaybackClock } from '@/lyrics/clock';
import { useLyrics } from '@/lyrics/fetch';
import { useLyricsOffset } from '@/lyrics/offset';
import { useLyricsScreen } from '@/lyrics/screen';
import { SyncPanel } from '@/lyrics/SyncPanel';
import { LyricsStage, pickLyrics } from '@/lyrics/LyricsStage';
import { ticksToSeconds } from '@/lib/format';
import { PlayButton } from '@/player/PlayButton';
import { SeekBar } from '@/player/SeekBar';
import { usePlayer } from '@/player/store';
import { useProgress } from '@/player/useProgress';
import { useOnAir } from '@/radio/live';
import { radioPositionMs, useOnAirSong } from '@/radio/sync';
import { useSettings } from '@/settings/store';
import { ArtistLinks } from '@/ui/ArtistLinks';
import { Artwork } from '@/ui/Artwork';
import { Glass } from '@/ui/Glass';
import { HeartButton } from '@/ui/HeartButton';
import { useInAnyPlaylist } from '@/library/playlistCache';
import { Marquee } from '@/ui/Marquee';
import { openAlbum } from '@/ui/nav';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const FOOTER_H = 150;

export default function LyricsScreen() {
  const t = useTheme();
  const styles = useStyles();
  useScreenAwake('lyrics');
  const insets = useSafeAreaInsets();
  const client = useAuth((s) => s.client);
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const playing = usePlayer((s) => s.playing);
  const inPlaylist = useInAnyPlaylist(track?.Id);
  const mode = useSettings((s) => s.lyricsMode);
  // A SUB/WAVE station: the lyrics of the song on air, from the same song in your library,
  // timed from when it started on the station (see radio/sync.ts).
  const streamUrl = track?.Radio?.streamUrl;
  const onAir = useOnAir((s) => (track?.Radio ? s.byStation[track.Radio.stationId] : undefined));
  const radioSong = useOnAirSong(streamUrl ? onAir?.title : undefined, onAir?.artist);
  const lyricsFor = streamUrl ? (radioSong.data ?? undefined) : track;
  const { data, isLoading } = useLyrics(lyricsFor?.Id);
  const startedAt = onAir?.startedAtMs;
  const songMs = radioSong.data ? ticksToSeconds(radioSong.data.RunTimeTicks) * 1000 : 0;
  const clock = useMemo(
    () =>
      streamUrl && startedAt
        ? { nowMs: () => radioPositionMs(startedAt, streamUrl), durationMs: () => songMs }
        : createPlaybackClock(),
    [streamUrl, startedAt, songMs],
  );
  const controls = useSettings((s) => s.lyricsControls);
  // The visualizer instead of the lyrics (songs without lyrics get it on their own), and the
  // timing panel: both switched from Lyrics style, so the top is only Close and Lyrics style.
  const visualizer = useLyricsScreen((s) => s.visualizer);
  const timing = useLyricsScreen((s) => s.timing);
  // Opened from the player's visualizer card: straight to the visualizer.
  const { visualizer: startWithVisualizer } = useLocalSearchParams<{ visualizer?: string }>();
  useEffect(() => {
    useLyricsScreen.getState().set({ visualizer: startWithVisualizer === '1', timing: false });
    return () => useLyricsScreen.getState().set({ visualizer: false, timing: false });
  }, [startWithVisualizer]);
  const setTiming = (on: boolean) => useLyricsScreen.getState().set({ timing: on });
  // This song's timing offset (saved on the phone; positive = lyrics later). Not for radio.
  const offset = useLyricsOffset(streamUrl ? undefined : lyricsFor?.Id);
  const timed = useMemo(
    () => (offset ? { nowMs: () => clock.nowMs() - offset, durationMs: clock.durationMs } : clock),
    [clock, offset],
  );

  const lyrics = pickLyrics(data, mode);
  const tint = artColor(track && client?.blurhash(track));
  const footerSpace = (controls ? FOOTER_H : FOOTER_H - 60) + insets.bottom;
  const canTime = !!lyrics && !streamUrl && !!lyricsFor;

  // The screen covers the app (no sheet): swiping down on the header or the controls closes it,
  // the screen following the finger like the player's sheet (the lyrics themselves scroll).
  const swipe = useSwipeDown();

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: '#000' }, swipe.style]}>
      <LyricsStage
        lyrics={lyrics}
        loading={isLoading || (!!streamUrl && radioSong.isLoading)}
        mode={mode}
        nowMs={timed.nowMs}
        durationMs={timed.durationMs}
        // A live stream can't seek.
        onSeek={streamUrl ? () => {} : (ms) => usePlayer.getState().seek(ms / 1000)}
        // The same small cover as the player's moving background: it's blurred anyway, and it's
        // already decoded and blurred in memory, so opening the lyrics adds no new image work.
        artUri={
          track?.Radio
            ? (track.Radio.coverUrl ?? track.Radio.imageUri)
            : track
              ? (localArtUri(track.AlbumId ?? track.Id) ?? client?.imageUrl(track, 300))
              : undefined
        }
        tint={tint}
        footerSpace={footerSpace}
        visualizer={visualizer}
        header={
          <GestureDetector gesture={swipe.pan()}>
            <View style={{ paddingTop: insets.top + t.space.xs }}>
              <View style={styles.topBar}>
                <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back to Player">
                  <Ionicons name="chevron-down" size={28} color={t.colors.text} />
                </Pressable>
                {/* 2.0: the heart, with Lyrics Style right next to it. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
                {track && !track.Radio ? (
                  <HeartButton
                    liked={track.UserData?.IsFavorite ?? false}
                    inPlaylist={inPlaylist}
                    size={26}
                    onToggle={(v) => usePlayer.getState().setFavorite(track.Id, v)}
                  />
                ) : null}
                <Pressable
                  hitSlop={10}
                  onPress={() =>
                    router.push({ pathname: '/lyrics-style', params: { from: 'lyrics', lyrics: lyrics ? '1' : '0', timing: canTime ? '1' : '0', song: !streamUrl && lyricsFor ? lyricsFor.Id : '' } })
                  }
                  accessibilityLabel="Lyrics Style">
                  <Ionicons name="options-outline" size={24} color={visualizer || offset ? t.colors.accentText : t.colors.text} />
                </Pressable>
                </View>
              </View>
              {track ? <NowPlayingHeader track={track} /> : null}
            </View>
          </GestureDetector>
        }
      />

      {/* Footer: credit (required for Spicy Lyrics API lyrics) + transport */}
      <GestureDetector gesture={swipe.pan()}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + t.space.sm }]} pointerEvents="box-none">
          {timing && canTime && lyrics && lyricsFor ? (
            <SyncPanel itemId={lyricsFor.Id} lyrics={lyrics} onClose={() => setTiming(false)} />
          ) : (
            <UpNext lyricsEndSec={lyrics?.isSynced && lyrics.lines.length ? (Math.max(...lyrics.lines.map((l) => l.endMs || l.startMs)) + offset) / 1000 : null} />
          )}
          {controls ? (
            // 2.0: a glass bar with the clean play bar over the transport.
            <Glass radius={26} style={styles.bar}>
              {streamUrl ? null : <LyricsSeek />}
              <View style={styles.transport}>
                <Pressable hitSlop={10} onPress={() => usePlayer.getState().previous()} accessibilityLabel="Previous">
                  <Ionicons name="play-skip-back" size={32} color={t.colors.text} />
                </Pressable>
                <PlayButton playing={playing} live={!!streamUrl} size={60} onPress={() => usePlayer.getState().toggle()} />
                <Pressable hitSlop={10} onPress={() => usePlayer.getState().next()} accessibilityLabel="Next">
                  <Ionicons name="play-skip-forward" size={32} color={t.colors.text} />
                </Pressable>
              </View>
            </Glass>
          ) : null}
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

/** The lyrics bar's clean play bar (its own component, so the lyrics don't re-render with it). */
function LyricsSeek() {
  const { position, duration } = useProgress(500);
  return <SeekBar size="small" position={position} duration={duration} onSeek={(s) => usePlayer.getState().seek(s)} />;
}

const UP_NEXT_SECONDS = 15;

/**
 * The next song, as the desktop's (and the web mod's) Next Up card: its cover, "Next Up", the
 * title and artist on the lyrics' background, no box. It floats up once the singing is over or
 * the song has 15 seconds left. Tap for the queue.
 */
function UpNext({ lyricsEndSec }: { lyricsEndSec: number | null }) {
  const t = useTheme();
  const styles = useStyles();
  const next = usePlayer((s) => s.queue[s.index + 1]?.item);
  const repeatOne = usePlayer((s) => s.repeat === 'one');
  const { position, duration } = useProgress(500);
  const remaining = duration - position;
  const sung = lyricsEndSec !== null && lyricsEndSec > 0 && position >= lyricsEndSec;
  if (!next || repeatOne || duration < 30 || remaining <= 0 || (!sung && remaining > UP_NEXT_SECONDS)) return null;
  return (
    <Animated.View
      entering={t.reduceMotion ? undefined : FadeInDown.duration(600)}
      exiting={t.reduceMotion ? undefined : FadeOutDown.duration(250)}
      style={styles.upNextWrap}>
      <Pressable
        onPress={() => router.push('/queue')}
        accessibilityLabel={`Next up: ${next.Name}`}
        style={({ pressed }) => [styles.upNext, pressed && { opacity: 0.7 }]}>
        <Artwork item={next} size={48} rounded={7} />
        <View style={{ flex: 1, marginLeft: 13 }}>
          <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(13), color: 'rgba(255,255,255,0.75)' }}>Next Up</T>
          <T numberOfLines={1} style={{ fontFamily: t.fonts.black, fontSize: t.size(19), color: '#fff' }}>
            {next.Name}
          </T>
          <T numberOfLines={1} style={{ fontFamily: t.fonts.medium, fontSize: t.size(14), color: 'rgba(255,255,255,0.8)' }}>
            {artistLine(next)}
          </T>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Album art + title + artist + album · year, like Spicy Lyrics' compact view. */
function NowPlayingHeader({ track }: { track: BaseItem }) {
  const t = useTheme();
  const styles = useStyles();
  const albumLine = [track.Album, track.ProductionYear].filter(Boolean).join(' · ');
  // Radio has no album page to go to.
  const album = track.AlbumId && !track.Radio ? () => openAlbum(track.AlbumId!) : undefined;
  return (
    <View style={styles.nowPlaying}>
      <Pressable disabled={!album} onPress={album}>
        <Artwork item={track} size={92} rounded={t.radius.card} style={styles.art} />
      </Pressable>
      <View style={{ flex: 1, marginLeft: t.space.lg }}>
        <Pressable disabled={!album} onPress={album}>
          <Marquee text={track.Name} style={{ fontFamily: t.fonts.black, fontSize: t.size(22), letterSpacing: -0.4 }} />
        </Pressable>
        <ArtistLinks
          artists={track.ArtistItems}
          fallback={artistLine(track)}
          numberOfLines={1}
          style={{ fontFamily: t.fonts.semibold, fontSize: t.size(15), color: t.colors.textSecondary, marginTop: 2 }}
        />
        {albumLine ? (
          <T
            numberOfLines={1}
            onPress={album}
            suppressHighlighting
            style={{ fontFamily: t.fonts.medium, fontSize: t.size(13), color: t.colors.textMuted, marginTop: 2 }}>
            {albumLine}
          </T>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.lg,
    height: 44,
  },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.space.xl,
    paddingTop: t.space.sm,
    paddingBottom: t.space.md,
  },
  art: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  upNextWrap: { alignSelf: 'stretch', paddingHorizontal: t.space.lg, marginBottom: t.space.md },
  // As the desktop's Next Up: no box, straight on the lyrics' background.
  upNext: { flexDirection: 'row', alignItems: 'center' },
  bar: { alignSelf: 'stretch', marginHorizontal: 12, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 10, gap: 8 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 },
}));
