import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
import { useSettings, type LyricsMode } from '@/settings/store';
import { Artwork } from '@/ui/Artwork';
import { T } from '@/ui/T';
import { colors, fonts, radius, space } from '@/ui/theme';

const FOOTER_H = 110;

export default function LyricsScreen() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const client = useAuth((s) => s.client);
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const playing = usePlayer((s) => s.playing);
  const mode = useSettings((s) => s.lyricsMode);
  const { data, isLoading } = useLyrics(track?.Id);
  const clock = useMemo(() => createPlaybackClock(), []);

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
        header={
          <GestureDetector gesture={swipeDown}>
            <View style={{ paddingTop: insets.top + space.xs }}>
              <View style={styles.topBar}>
                <Pressable hitSlop={12} onPress={() => router.back()}>
                  <Ionicons name="chevron-down" size={28} color={colors.text} />
                </Pressable>
                <ModeToggle mode={mode} />
              </View>
              {track ? <NowPlayingHeader track={track} /> : null}
            </View>
          </GestureDetector>
        }
      />

      {/* Footer: credit (required for Spicy Lyrics API lyrics) + transport */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]} pointerEvents="box-none">
        {credit ? (
          <T variant="caption" numberOfLines={1} style={styles.credit}>
            {credit}
          </T>
        ) : null}
        <View style={styles.transport}>
          <Pressable hitSlop={10} onPress={() => usePlayer.getState().previous()}>
            <Ionicons name="play-skip-back" size={26} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => usePlayer.getState().toggle()} style={styles.play}>
            <Ionicons name={playing ? 'pause' : 'play'} size={26} color="#000" style={{ marginLeft: playing ? 0 : 3 }} />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => usePlayer.getState().next()}>
            <Ionicons name="play-skip-forward" size={26} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Album art + title + artist + album · year, like Spicy Lyrics' compact view. */
function NowPlayingHeader({ track }: { track: BaseItem }) {
  const albumLine = [track.Album, track.ProductionYear].filter(Boolean).join(' · ');
  return (
    <View style={styles.nowPlaying}>
      <Artwork item={track} size={92} rounded={radius.card} style={styles.art} />
      <View style={{ flex: 1, marginLeft: space.lg }}>
        <T numberOfLines={2} style={{ fontFamily: fonts.black, fontSize: 22, letterSpacing: -0.4 }}>
          {track.Name}
        </T>
        <T numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.textSecondary, marginTop: 2 }}>
          {artistLine(track)}
        </T>
        {albumLine ? (
          <T numberOfLines={1} style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
            {albumLine}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** One tap between the two lyric systems; remembered as the default. */
function ModeToggle({ mode }: { mode: LyricsMode }) {
  const set = (m: LyricsMode) => useSettings.getState().set('lyricsMode', m);
  return (
    <View style={styles.toggle}>
      {(['spicy', 'regular'] as const).map((m) => (
        <Pressable key={m} onPress={() => set(m)} style={[styles.toggleBtn, mode === m && styles.toggleOn]}>
          <T style={{ fontFamily: fonts.bold, fontSize: 12, color: mode === m ? '#000' : colors.text }}>
            {m === 'spicy' ? 'Spicy' : 'Regular'}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    height: 44,
  },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  art: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  credit: { fontSize: 11, marginBottom: space.sm, paddingHorizontal: space.xl, opacity: 0.8 },
  transport: { flexDirection: 'row', alignItems: 'center', gap: space.xxl },
  play: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.pill,
    padding: 3,
  },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  toggleOn: { backgroundColor: colors.text },
});
