// Dev-only preview of both lyric systems with made-up lyrics on a looping fake clock, so the
// renderers can be checked (on web or a phone) without signing in or playing a song.
// Open /lyrics-demo in the dev server.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LyricsStage } from '@/lyrics/LyricsStage';
import type { LyricLine, Lyrics, WordCue } from '@/lyrics/types';
import type { LyricsMode } from '@/settings/store';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

const LOOP_MS = 30_000;

/** Words spread evenly over [start, end]; `hold` gives one word a long, spelled-out duration. */
function words(text: string, start: number, end: number, hold?: { word: string; ms: number }): WordCue[] {
  const parts = text.split(' ');
  const holdMs = hold ? hold.ms : 0;
  const each = (end - start - holdMs) / (parts.length - (hold ? 1 : 0));
  let t = start;
  return parts.map((p, i) => {
    const dur = hold && p === hold.word ? holdMs : each;
    const cue = { text: i < parts.length - 1 ? `${p} ` : p, startMs: Math.round(t), endMs: Math.round(t + dur) };
    t += dur;
    return cue;
  });
}

function line(text: string, start: number, end: number, opts: Partial<LyricLine> & { hold?: { word: string; ms: number } } = {}): LyricLine {
  return { text, startMs: start, endMs: end, words: words(text, start, end, opts.hold), agent: opts.agent ?? 'v1', bgWords: opts.bgWords };
}

const DEMO: Lyrics = {
  kind: 'ttml',
  isSynced: true,
  hasWordCues: true,
  songwriters: ['Rakki Demo'],
  source: 'spicy_lyrics',
  attribution: { maker: { username: 'demo', url: '' } },
  lines: [
    line('Rakki runs the lyrics now', 1000, 3400),
    line('every single word begins to glow', 3500, 6600, {
      hold: { word: 'glow', ms: 1300 },
      bgWords: words('(glow, glow)', 5800, 7000),
    }),
    line('and the second voice replies', 7100, 9400, { agent: 'v2' }),
    line('somewhere on the other side', 9500, 11800),
    // 5 s pause → interlude dots
    line('back again after the break', 17000, 19600),
    line('holding on to one long note', 19700, 23300, { hold: { word: 'long', ms: 1600 } }),
    line('we sing it all together', 23400, 26000, { agent: 'v2' }),
  ],
};

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
        lyrics={DEMO}
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
