// Dev-only preview of both lyric systems with made-up lyrics on a looping fake clock, so the
// renderers can be checked (on web or a phone) without signing in or playing a song.
// Open /lyrics-demo in the dev server.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LyricsStage } from '@/lyrics/LyricsStage';
import { DEMO_LYRICS, LOOP_MS } from '@/lyrics/demo';
import type { LyricsMode } from '@/settings/store';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

export default function LyricsDemo() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<LyricsMode>('spicy');
  const [t0, setT0] = useState(() => Date.now());
  const clock = useMemo(
    () => ({
      nowMs: () => (Date.now() - t0) % LOOP_MS,
      durationMs: () => LOOP_MS,
    }),
    [t0],
  );
  if (!__DEV__) return null;

  const toggle = (
    <View style={{ flexDirection: 'row', gap: t.space.sm, alignItems: 'center' }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Ionicons name="close" size={26} color={t.colors.text} />
      </Pressable>
      <View style={{ flex: 1 }} />
      {(['spicy', 'regular'] as const).map((m) => (
        <Pressable
          key={m}
          onPress={() => setMode(m)}
          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: t.radius.pill, backgroundColor: mode === m ? t.colors.text : 'rgba(0,0,0,0.4)' }}>
          <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(12), color: mode === m ? '#000' : t.colors.text }}>{m}</T>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <LyricsStage
        lyrics={DEMO_LYRICS}
        loading={false}
        mode={mode}
        nowMs={clock.nowMs}
        durationMs={clock.durationMs}
        onSeek={(ms) => setT0(Date.now() - ms)}
        tint="#6b2d1f"
        footerSpace={110}
        header={
          <View style={{ paddingTop: insets.top + t.space.sm, paddingHorizontal: t.space.lg }}>
            {toggle}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.sm, paddingVertical: t.space.md }}>
              <View style={{ width: 92, height: 92, borderRadius: t.radius.card, backgroundColor: '#c0482c' }} />
              <View style={{ marginLeft: t.space.lg }}>
                <T style={{ fontFamily: t.fonts.black, fontSize: t.size(22) }}>Demo Song</T>
                <T variant="caption" style={{ fontSize: t.size(15) }}>Rakki</T>
                <T variant="caption" style={{ fontSize: t.size(13), color: t.colors.textMuted }}>Made-up Lyrics · 2026</T>
              </View>
            </View>
          </View>
        }
      />
    </View>
  );
}
