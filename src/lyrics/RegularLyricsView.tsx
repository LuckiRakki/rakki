import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Lyrics } from '@/lyrics/types';
import { T } from '@/ui/T';
import { fonts, space } from '@/ui/theme';

const MANUAL_RESUME_MS = 4000;

interface Line {
  text: string;
  startMs: number;
  endMs: number;
}

/** Line timings for Regular mode: TTML lines keep their own range (incl. background vocals). */
function toLines(l: Lyrics): Line[] {
  return l.lines.map((line) => {
    let start = line.startMs;
    let end = line.endMs;
    for (const w of [...(line.words ?? []), ...(line.bgWords ?? [])]) {
      start = Math.min(start, w.startMs);
      end = Math.max(end, w.endMs);
    }
    const text = line.text || (line.words ?? []).map((w) => w.text).join('').trim();
    return { text, startMs: start, endMs: end };
  });
}

/**
 * Regular mode: clean Spotify-style lyrics. The current line is white, lines already sung
 * are soft white, lines still to come are dark; the list glides to keep the current line
 * in view. Light on battery: one re-render per line change, no per-frame drawing.
 */
export function RegularLyricsView({
  lyrics,
  nowMs,
  onSeek,
}: {
  lyrics: Lyrics;
  nowMs: () => number;
  onSeek: (ms: number) => void;
}) {
  const lines = toLines(lyrics);
  const [active, setActive] = useState(-1);
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const manualUntil = useRef(0);
  const [viewH, setViewH] = useState(0);

  useEffect(() => {
    if (!lyrics.isSynced) return;
    const id = setInterval(() => {
      const ms = nowMs();
      let idx = -1;
      for (let i = 0; i < lines.length; i++) if (ms >= lines[i].startMs) idx = i;
      setActive((prev) => (prev === idx ? prev : idx));
    }, 100);
    return () => clearInterval(id);
  }, [lyrics, lines, nowMs]);

  useEffect(() => {
    if (active < 0 || Date.now() < manualUntil.current) return;
    const y = offsets.current[active];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - viewH * 0.3), animated: true });
  }, [active, viewH]);

  return (
    <ScrollView
      ref={scroll}
      onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
      onScrollBeginDrag={() => (manualUntil.current = Date.now() + 60_000)}
      onScrollEndDrag={() => (manualUntil.current = Date.now() + MANUAL_RESUME_MS)}
      onMomentumScrollEnd={() => (manualUntil.current = Date.now() + MANUAL_RESUME_MS)}
      contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: viewH * 0.3, paddingBottom: viewH * 0.6 }}
      showsVerticalScrollIndicator={false}>
      {lines.map((line, i) => {
        const color = !lyrics.isSynced
          ? 'rgba(255,255,255,0.9)'
          : i === active
            ? '#fff'
            : i < active
              ? 'rgba(255,255,255,0.55)'
              : 'rgba(0,0,0,0.55)';
        return (
          <View key={i} onLayout={(e) => (offsets.current[i] = e.nativeEvent.layout.y)}>
            <Pressable disabled={!lyrics.isSynced} onPress={() => onSeek(line.startMs)}>
              <T style={[styles.line, { color }]}>{line.text || '♪'}</T>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 34, marginBottom: space.lg, letterSpacing: -0.3 },
});
