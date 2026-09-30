import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { artistLine } from '@/lib/items';
import { createPlaybackClock } from '@/lyrics/clock';
import { creditLine, useLyrics } from '@/lyrics/fetch';
import { LyricsStage, pickLyrics } from '@/lyrics/LyricsStage';
import { usePlayer } from '@/player/store';
import { useSettings, type LyricsMode } from '@/settings/store';
import { T } from '@/ui/T';
import { colors, fonts, radius, space } from '@/ui/theme';

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
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top > 20 ? space.md : space.lg }]} pointerEvents="box-none">
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: space.md }}>
          <T numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 15 }}>
            {track?.Name ?? ''}
          </T>
          <T variant="caption" numberOfLines={1} style={{ fontSize: 13 }}>
            {track ? artistLine(track) : ''}
          </T>
        </View>
        <ModeToggle mode={mode} />
      </View>

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

/** One tap between the two lyric systems; remembered as the default. */
function ModeToggle({ mode }: { mode: LyricsMode }) {
  const set = (m: LyricsMode) => useSettings.getState().set('lyricsMode', m);
  return (
    <View style={styles.toggle}>
      {(['spicy', 'regular'] as const).map((m) => (
        <Pressable key={m} onPress={() => set(m)} style={[styles.toggleBtn, mode === m && styles.toggleOn]}>
          <T style={{ fontFamily: fonts.bold, fontSize: 12, color: mode === m ? '#000' : colors.text }}>
            {m === 'spicy' ? '🌶 Spicy' : 'Regular'}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
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
