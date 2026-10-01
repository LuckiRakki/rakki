import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { artistLine } from '@/lib/items';
import { createPlaybackClock } from '@/lyrics/clock';
import { creditLine, useLyrics } from '@/lyrics/fetch';
import { LyricsStage, pickLyrics } from '@/lyrics/LyricsStage';
import { usePlayer } from '@/player/store';
import { useProgress } from '@/player/useProgress';
import { useSettings, type LyricsMode } from '@/settings/store';
import { Artwork } from '@/ui/Artwork';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const FOOTER_H = 110;

export default function LyricsScreen() {
  const t = useTheme();
  const styles = useStyles();
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const client = useAuth((s) => s.client);
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const playing = usePlayer((s) => s.playing);
  const mode = useSettings((s) => s.lyricsMode);
  const { data, isLoading } = useLyrics(track?.Id);
  const clock = useMemo(() => createPlaybackClock(), []);
  // The visualizer instead of the lyrics (songs without lyrics get it on their own).
  const [visualizer, setVisualizer] = useState(false);

  const lyrics = pickLyrics(data, mode);
  const credit = lyrics ? creditLine(lyrics) : null;
  const tint = artColor(track && client?.blurhash(track));
  const footerSpace = FOOTER_H + insets.bottom + (credit ? 18 : 0);

  // The screen is full-screen (no sheet), so swiping down on the header closes it.
  const swipeDown = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(24)
    .failOffsetX([-24, 24])
    .onEnd((e) => {
      if (e.translationY > 70 || e.velocityY > 800) router.back();
    });

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <LyricsStage
        lyrics={lyrics}
        loading={isLoading}
        mode={mode}
        nowMs={clock.nowMs}
        durationMs={clock.durationMs}
        onSeek={(ms) => usePlayer.getState().seek(ms / 1000)}
        artUri={track ? client?.imageUrl(track, 600) : undefined}
        tint={tint}
        footerSpace={footerSpace}
        visualizer={visualizer}
        header={
          <GestureDetector gesture={swipeDown}>
            <View style={{ paddingTop: insets.top + t.space.xs }}>
              <View style={styles.topBar}>
                <Pressable hitSlop={12} onPress={() => router.back()}>
                  <Ionicons name="chevron-down" size={28} color={t.colors.text} />
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
                  {lyrics ? (
                    <Pressable
                      hitSlop={10}
                      onPress={() => setVisualizer(!visualizer)}
                      accessibilityLabel={visualizer ? 'Show lyrics' : 'Show visualizer'}
                      accessibilityState={{ selected: visualizer }}>
                      <Ionicons
                        name={visualizer ? 'stats-chart' : 'stats-chart-outline'}
                        size={21}
                        color={visualizer ? t.colors.accent : t.colors.text}
                      />
                    </Pressable>
                  ) : null}
                  <Pressable hitSlop={10} onPress={() => router.push('/lyrics-style')} accessibilityLabel="Lyrics style">
                    <Ionicons name="options-outline" size={24} color={t.colors.text} />
                  </Pressable>
                  <ModeToggle mode={mode} />
                </View>
              </View>
              {track ? <NowPlayingHeader track={track} /> : null}
            </View>
          </GestureDetector>
        }
      />

      {/* Footer: credit (required for Spicy Lyrics API lyrics) + transport */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + t.space.sm }]} pointerEvents="box-none">
        <UpNext />
        {credit ? (
          <T variant="caption" numberOfLines={1} style={styles.credit}>
            {credit}
          </T>
        ) : null}
        <View style={styles.transport}>
          <Pressable hitSlop={10} onPress={() => usePlayer.getState().previous()}>
            <Ionicons name="play-skip-back" size={26} color={t.colors.text} />
          </Pressable>
          <Pressable onPress={() => usePlayer.getState().toggle()} style={styles.play}>
            <Ionicons name={playing ? 'pause' : 'play'} size={26} color="#000" style={{ marginLeft: playing ? 0 : 3 }} />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => usePlayer.getState().next()}>
            <Ionicons name="play-skip-forward" size={26} color={t.colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const UP_NEXT_SECONDS = 15;

/** The next song, slid up above the controls for the last seconds of this one. Tap for the queue. */
function UpNext() {
  const t = useTheme();
  const styles = useStyles();
  const next = usePlayer((s) => s.queue[s.index + 1]?.item);
  const repeatOne = usePlayer((s) => s.repeat === 'one');
  const { position, duration } = useProgress(500);
  const remaining = duration - position;
  if (!next || repeatOne || duration < 30 || remaining <= 0 || remaining > UP_NEXT_SECONDS) return null;
  return (
    <Animated.View
      entering={t.reduceMotion ? undefined : FadeInDown.duration(300)}
      exiting={t.reduceMotion ? undefined : FadeOutDown.duration(200)}
      style={styles.upNextWrap}>
      <Pressable
        onPress={() => router.push('/queue')}
        accessibilityLabel={`Up next: ${next.Name}`}
        style={({ pressed }) => [styles.upNext, pressed && { opacity: 0.8 }]}>
        <Artwork item={next} size={40} />
        <View style={{ flex: 1, marginLeft: t.space.md }}>
          <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(11), color: 'rgba(255,255,255,0.7)' }}>Up next</T>
          <T variant="bodyStrong" numberOfLines={1}>
            {next.Name}
          </T>
          <T variant="caption" numberOfLines={1} style={{ color: 'rgba(255,255,255,0.75)' }}>
            {artistLine(next)}
          </T>
        </View>
        <Ionicons name="list" size={20} color={t.colors.text} />
      </Pressable>
    </Animated.View>
  );
}

/** Album art + title + artist + album · year, like Spicy Lyrics' compact view. */
function NowPlayingHeader({ track }: { track: BaseItem }) {
  const t = useTheme();
  const styles = useStyles();
  const albumLine = [track.Album, track.ProductionYear].filter(Boolean).join(' · ');
  return (
    <View style={styles.nowPlaying}>
      <Artwork item={track} size={92} rounded={t.radius.card} style={styles.art} />
      <View style={{ flex: 1, marginLeft: t.space.lg }}>
        <T numberOfLines={2} style={{ fontFamily: t.fonts.black, fontSize: t.size(22), letterSpacing: -0.4 }}>
          {track.Name}
        </T>
        <T numberOfLines={1} style={{ fontFamily: t.fonts.semibold, fontSize: t.size(15), color: t.colors.textSecondary, marginTop: 2 }}>
          {artistLine(track)}
        </T>
        {albumLine ? (
          <T numberOfLines={1} style={{ fontFamily: t.fonts.medium, fontSize: t.size(13), color: t.colors.textMuted, marginTop: 2 }}>
            {albumLine}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** One tap between the two lyric systems; remembered as the default. */
function ModeToggle({ mode }: { mode: LyricsMode }) {
  const t = useTheme();
  const styles = useStyles();
  const set = (m: LyricsMode) => useSettings.getState().set('lyricsMode', m);
  return (
    <View style={styles.toggle}>
      {(['spicy', 'regular'] as const).map((m) => (
        <Pressable key={m} onPress={() => set(m)} style={[styles.toggleBtn, mode === m && styles.toggleOn]}>
          <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(12), color: mode === m ? '#000' : t.colors.text }}>
            {m === 'spicy' ? 'Spicy' : 'Regular'}
          </T>
        </Pressable>
      ))}
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
  upNext: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: t.space.sm,
    paddingRight: t.space.md,
    borderRadius: t.radius.card,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  credit: { fontSize: t.size(11), marginBottom: t.space.sm, paddingHorizontal: t.space.xl, opacity: 0.8 },
  transport: { flexDirection: 'row', alignItems: 'center', gap: t.space.xxl },
  play: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: t.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: t.radius.pill,
    padding: 3,
  },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: t.radius.pill },
  toggleOn: { backgroundColor: t.colors.text },
}));
