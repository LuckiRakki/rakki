import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';

import { withAlpha } from '@/lib/color';
import { creditRows } from '@/lyrics/fetch';
import { useLyricsStyle } from '@/lyrics/style';
import type { Lyrics } from '@/lyrics/types';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

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
  anchor = 0.3,
  fadeColor,
  fadeTop = 0,
  fadeBottom = 0,
}: {
  lyrics: Lyrics;
  nowMs: () => number;
  onSeek: (ms: number) => void;
  /** Fraction of the view height where the current line sits. */
  anchor?: number;
  /** Background colour the edges fade into (Regular mode sits on a solid colour). */
  fadeColor?: string;
  fadeTop?: number;
  fadeBottom?: number;
}) {
  const t = useTheme();
  const styles = useStyles();
  const scale = useLyricsStyle((s) => s.regularSize);
  const align = useLyricsStyle((s) => s.regularAlign);
  const dim = useLyricsStyle((s) => s.regularDim);
  const current = useLyricsStyle((s) => (s.regularColor === 'accent' ? t.colors.accent : '#fff'));
  const lineStyle = { fontSize: t.size(26 * scale), lineHeight: t.size(34 * scale), textAlign: align } as const;
  const lines = toLines(lyrics);
  const [active, setActive] = useState(-1);
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const manualUntil = useRef(0);
  const [viewH, setViewH] = useState(0);
  // The top fade only appears once lines are scrolling under the header.
  const [scrollY] = useState(() => new Animated.Value(0));
  const topFadeOpacity = scrollY.interpolate({ inputRange: [0, Math.max(1, fadeTop)], outputRange: [0, 1], extrapolate: 'clamp' });

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
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - viewH * anchor), animated: !t.reduceMotion });
  }, [active, viewH, anchor, t.reduceMotion]);

  return (
    <View style={{ flex: 1 }}>
    <Animated.ScrollView
      ref={scroll}
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
      onScrollBeginDrag={() => (manualUntil.current = Date.now() + 60_000)}
      onScrollEndDrag={() => (manualUntil.current = Date.now() + MANUAL_RESUME_MS)}
      onMomentumScrollEnd={() => (manualUntil.current = Date.now() + MANUAL_RESUME_MS)}
      contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingTop: t.space.sm, paddingBottom: viewH * 0.7 }}
      showsVerticalScrollIndicator={false}>
      {lines.map((line, i) => {
        const color = !lyrics.isSynced
          ? 'rgba(255,255,255,0.9)'
          : i === active
            ? current
            : i < active
              ? `rgba(255,255,255,${dim})`
              : `rgba(0,0,0,${dim})`;
        return (
          <View key={i} onLayout={(e) => (offsets.current[i] = e.nativeEvent.layout.y)}>
            <Pressable disabled={!lyrics.isSynced} onPress={() => onSeek(line.startMs)}>
              {line.text ? (
                <T style={[styles.line, lineStyle, { color }]}>{line.text}</T>
              ) : (
                <Ionicons
                  name="musical-notes"
                  size={26 * scale}
                  color={color}
                  style={[styles.note, align === 'center' && { alignSelf: 'center' }]}
                />
              )}
            </Pressable>
          </View>
        );
      })}
      <Credits lyrics={lyrics} align={align} />
    </Animated.ScrollView>
      {fadeColor && fadeTop > 0 ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: fadeTop, opacity: topFadeOpacity }}>
          <LinearGradient colors={[fadeColor, withAlpha(fadeColor, 0)]} style={{ flex: 1 }} />
        </Animated.View>
      ) : null}
      {fadeColor && fadeBottom > 0 ? (
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(fadeColor, 0), fadeColor]}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: fadeBottom }}
        />
      ) : null}
    </View>
  );
}

/** After the last line: who wrote it, and who provided the lyrics (tap a name for their profile). */
function Credits({ lyrics, align }: { lyrics: Lyrics; align: 'left' | 'center' }) {
  const t = useTheme();
  const rows = creditRows(lyrics);
  if (!rows.length) return null;
  const written = lyrics.songwriters?.length ? 1 : 0;
  return (
    <View style={{ marginTop: t.space.md, gap: 6, alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      {rows.map((row, i) => (
        <Pressable
          key={row.text}
          disabled={!row.link}
          onPress={() => row.link && void WebBrowser.openBrowserAsync(row.link)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: i === written && i > 0 ? t.space.sm : 0 }}>
          {row.avatar ? (
            <Image source={{ uri: row.avatar }} style={{ width: 18, height: 18, borderRadius: 9 }} contentFit="cover" />
          ) : null}
          <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(row.small ? 12 : 14), color: 'rgba(255,255,255,0.7)' }}>
            {row.text}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  line: { fontFamily: t.fonts.bold, fontSize: t.size(26), lineHeight: t.size(34), marginBottom: t.space.lg, letterSpacing: -0.3 },
  note: { height: 34, marginBottom: t.space.lg },
}));
