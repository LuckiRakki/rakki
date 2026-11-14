// The player held sideways (Look → Now Playing → Turn for Full Screen), like the desktop's full
// screen player: Kawarp across the whole screen, the artwork and the song on the left, and on the
// right the lyrics (Spicy or Regular, as Lyrics Style picks) or, for a song without them, the
// visualizer. The controls under the song fade away after a few seconds (Look → Now Playing →
// Hide Controls When Idle) and the cover and the song grow into their space; a touch brings them back.
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { localArtUri } from '@/downloads/store';
import { artColor } from '@/lib/blurhash';
import { artistLine } from '@/lib/items';
import { useScreenAwake } from '@/lib/keepAwake';
import { createPlaybackClock } from '@/lyrics/clock';
import { useLyrics } from '@/lyrics/fetch';
import { pickLyrics } from '@/lyrics/LyricsStage';
import { useLyricsOffset } from '@/lyrics/offset';
import { RegularLyricsView } from '@/lyrics/RegularLyricsView';
import { PlayButton } from '@/player/PlayButton';
import { SeekBar } from '@/player/SeekBar';
import { usePlayer } from '@/player/store';
import { useProgress } from '@/player/useProgress';
import { useSettings } from '@/settings/store';
import { SpicyBackdrop } from '@/spicy/Backdrop';
import { SpicyLyrics } from '@/spicy/SpicyLyrics';
import { Artwork } from '@/ui/Artwork';
import { FadeColor } from '@/ui/FadeColor';
import { Ionicons } from '@/ui/Icon';
import { Marquee } from '@/ui/Marquee';
import { SoundGraph } from '@/ui/SoundGraph';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** How long the controls stay after the last touch. */
const IDLE_MS = 4000;
/** Hiding is slow and soft; coming back is quick, so a touch feels answered. */
const HIDE = { duration: 700, easing: Easing.inOut(Easing.cubic) };
const SHOW = { duration: 340, easing: Easing.out(Easing.cubic) };
/** The sung line sits a little above the middle: the screen is short sideways. */
const ANCHOR = 0.36;

export function LandscapePlayer({ track }: { track: BaseItem }) {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  useScreenAwake('lyrics');
  const client = useAuth((s) => s.client);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const mode = useSettings((s) => s.lyricsMode);
  const radio = !!track.Radio;
  const { data } = useLyrics(radio ? undefined : track.Id);
  const lyrics = radio ? null : pickLyrics(data, mode);
  const hasWords = !!lyrics?.lines.some((l) => l.text.trim());
  // The song's timing offset (Lyrics → timing), as on the lyrics screen.
  const offset = useLyricsOffset(radio ? undefined : track.Id);
  const clock = useMemo(() => createPlaybackClock(), []);
  const timed = useMemo(() => (offset ? { nowMs: () => clock.nowMs() - offset, durationMs: clock.durationMs } : clock), [clock, offset]);
  const p = usePlayer.getState;

  // The controls fade after a few seconds without a touch (unless that's turned off).
  const autoHide = t.appearance.fullScreenAutoHide;
  const [touchedAt, setTouchedAt] = useState(0);
  const [timedOut, setIdle] = useState(false);
  const idle = autoHide && timedOut;
  const shown = useSharedValue(1);
  useEffect(() => {
    if (!autoHide) return;
    const id = setTimeout(() => setIdle(true), IDLE_MS);
    return () => clearTimeout(id);
  }, [touchedAt, autoHide]);
  useEffect(() => {
    shown.set(t.reduceMotion ? (idle ? 0 : 1) : withTiming(idle ? 0 : 1, idle ? HIDE : SHOW));
  }, [idle, shown, t.reduceMotion]);
  const wake = () => {
    setIdle(false);
    setTouchedAt(Date.now());
  };

  const left = Math.max(insets.left, t.space.xl);
  const right = Math.max(insets.right, t.space.lg);
  const column = Math.round((width - left - right) * 0.36);

  // The left column is laid out twice, with the controls and without, and every piece is centred
  // in it. The cover is drawn at its big size and scaled down while the controls show; the song
  // slides with it, so hiding and showing move only transforms (no layout pass per frame).
  const [textH, setTextH] = useState(Math.round(t.size(22) * 1.3 + t.size(15) * 1.3 + 2));
  const [controlsH, setControlsH] = useState(radio ? 64 : 110);
  const areaH = height - insets.top - insets.bottom;
  const room = areaH - t.space.lg * 2;
  const gap = t.space.lg;
  const big = Math.max(80, Math.min(column, room - gap - textH));
  const small = Math.max(64, Math.min(column, room - gap - textH - t.space.md - controlsH));
  const withControls = small + gap + textH + t.space.md + controlsH;
  const topShown = (areaH - withControls) / 2;
  const topHidden = (areaH - (big + gap + textH)) / 2;
  const artMove = topShown + small / 2 - (topHidden + big / 2);
  const textMove = topShown + small - (topHidden + big);
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: shown.get() * artMove }, { scale: 1 + shown.get() * (small / big - 1) }],
  }));
  const textStyle = useAnimatedStyle(() => ({ transform: [{ translateY: shown.get() * textMove }] }));
  // The controls go in the first half of hiding, before the song moves into their place, and come
  // back in the second half of showing, once it has moved out of the way.
  const controlsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shown.get(), [0.5, 1], [0, 1], 'clamp'),
    transform: [{ translateY: (1 - shown.get()) * 14 }],
  }));
  const closeStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const backdrop = radio ? (track.Radio?.coverUrl ?? track.Radio?.imageUri) : (localArtUri(track.AlbumId ?? track.Id) ?? client?.imageUrl(track, 300));
  const tint = artColor(client?.blurhash(track));
  const lyricsW = width - left - right - column - t.space.xl;
  const lyricsH = height - insets.top - insets.bottom;

  return (
    <View style={styles.root} onTouchStart={wake}>
      <StatusBar hidden />
      {mode === 'spicy' ? <SpicyBackdrop uri={backdrop} /> : <FadeColor color={t.tint(tint)} />}

      <View style={[styles.side, { left, width: column, top: insets.top, bottom: insets.bottom }]}>
        <Animated.View style={[styles.abs, { top: topHidden, left: (column - big) / 2 }, artStyle]}>
          <Artwork item={track} size={big} style={styles.art} />
        </Animated.View>
        <Animated.View
          style={[styles.abs, { top: topHidden + big + gap, width: column }, textStyle]}
          onLayout={(e) => setTextH(Math.round(e.nativeEvent.layout.height))}
        >
          <Marquee text={track.Name} style={styles.title} center />
          <T numberOfLines={1} style={styles.artist}>
            {artistLine(track)}
          </T>
        </Animated.View>
        <Animated.View
          style={[styles.abs, { top: topShown + small + gap + textH + t.space.md, width: column }, controlsStyle]}
          onLayout={(e) => setControlsH(Math.round(e.nativeEvent.layout.height))}
          pointerEvents={idle ? 'none' : 'auto'}
        >
          {radio ? null : <Progress />}
          <View style={styles.transport}>
            {radio ? null : (
              <Pressable hitSlop={10} onPress={() => p().previous()} accessibilityLabel="Previous">
                <Ionicons name="play-skip-back" size={28} color={t.colors.text} />
              </Pressable>
            )}
            <PlayButton playing={playing} buffering={buffering} live={radio} size={52} onPress={() => p().toggle()} />
            {radio ? null : (
              <Pressable hitSlop={10} onPress={() => p().next()} accessibilityLabel="Next">
                <Ionicons name="play-skip-forward" size={28} color={t.colors.text} />
              </Pressable>
            )}
          </View>
        </Animated.View>
      </View>

      <View style={[styles.stage, { left: left + column + t.space.xl, right, top: insets.top, bottom: insets.bottom }]}>
        {hasWords && lyrics ? (
          mode === 'spicy' ? (
            <SpicyLyrics
              key={`${track.Id}:${lyrics.kind}`}
              lyrics={lyrics}
              nowMs={timed.nowMs}
              durationMs={timed.durationMs}
              onSeek={(ms) => p().seek(ms / 1000)}
              layout={{ anchor: ANCHOR, fadeTop: 28, fadeBottom: 40 }}
            />
          ) : (
            <RegularLyricsView
              key={`${track.Id}:${lyrics.kind}`}
              lyrics={lyrics}
              nowMs={timed.nowMs}
              onSeek={(ms) => p().seek(ms / 1000)}
              anchor={ANCHOR}
              fadeColor={t.tint(tint)}
              fadeTop={28}
              fadeBottom={40}
            />
          )
        ) : (
          <View style={styles.center}>
            <SoundGraph width={Math.max(1, lyricsW)} height={Math.round(Math.min(lyricsH * 0.62, 240))} />
          </View>
        )}
      </View>

      {/* Sideways the sheet can't be swiped away: this closes the player (turning upright works too). */}
      <Animated.View style={[styles.close, { top: Math.max(insets.top, t.space.md), right: right - 4 }, closeStyle]} pointerEvents={idle ? 'none' : 'auto'}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close Player" style={styles.closeBtn}>
          <Ionicons name="chevron-down" size={24} color={t.colors.text} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Its own component, so the lyrics don't re-render with the clock. */
function Progress() {
  const { position, duration } = useProgress(500);
  return <SeekBar size="small" position={position} duration={duration} onSeek={(s) => usePlayer.getState().seek(s)} />;
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: '#000' },
  side: { position: 'absolute' },
  abs: { position: 'absolute' },
  art: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  title: { fontFamily: t.fonts.black, fontSize: t.size(22), color: t.colors.text },
  artist: { fontFamily: t.fonts.semibold, fontSize: t.size(15), color: t.colors.textSecondary, marginTop: 2, textAlign: 'center' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.space.xl, marginTop: t.space.sm },
  stage: { position: 'absolute' },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
}));
