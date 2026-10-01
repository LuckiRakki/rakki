import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { blurhashAverage } from '@/lib/blurhash';
import { tileColor } from '@/lib/color';
import { creditLine, useLyrics } from '@/lyrics/fetch';
import { pickLyrics } from '@/lyrics/LyricsStage';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const CARD_HEIGHT = 340;

/**
 * Spotify's lyrics card under the full player: the album's colour, the lines around the one
 * being sung (sung lines white, upcoming lines dark), easing along as the song plays. Tap it
 * for the full lyrics screen. Renders nothing for songs without lyrics.
 */
export function LyricsCard({ track, positionSec }: { track: BaseItem; positionSec: number }) {
  const t = useTheme();
  const styles = useStyles();
  const client = useAuth((s) => s.client);
  const { data } = useLyrics(track.Id);
  const lyrics = pickLyrics(data, 'regular');
  const lineY = useRef<number[]>([]);
  const offset = useSharedValue(0);

  const lines = lyrics?.lines.filter((l) => l.text.trim()) ?? [];
  const synced = !!lyrics?.isSynced;
  const nowMs = positionSec * 1000;
  let current = -1;
  if (synced) for (let i = 0; i < lines.length && lines[i].startMs <= nowMs; i++) current = i;

  // Keep one sung line above the current one in view.
  useEffect(() => {
    const target = lineY.current[Math.max(0, current - 1)] ?? 0;
    offset.set(withTiming(-target, { duration: t.reduceMotion ? 0 : 380 }));
  }, [current, offset, t.reduceMotion]);

  const scroll = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));

  if (!lyrics || lines.length === 0) return null;

  const color = tileColor(blurhashAverage(client?.blurhash(track)), track.Id);
  const credit = creditLine(lyrics);

  return (
    <Pressable
      onPress={() => router.push('/lyrics')}
      accessibilityLabel="Open lyrics"
      style={({ pressed }) => [styles.card, { backgroundColor: color, opacity: pressed ? 0.9 : 1 }]}>
      <View style={styles.head}>
        <T style={styles.title}>Lyrics</T>
        <View style={styles.expand}>
          <Ionicons name="expand" size={16} color="#fff" />
        </View>
      </View>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View style={scroll}>
          {lines.map((line, i) => (
            <T
              key={i}
              onLayout={(e) => {
                lineY.current[i] = e.nativeEvent.layout.y;
              }}
              style={[styles.line, { color: !synced || i <= current ? '#fff' : 'rgba(0,0,0,0.7)' }]}>
              {line.text}
            </T>
          ))}
        </Animated.View>
      </View>
      {credit ? (
        <T numberOfLines={1} style={[styles.credit, { fontSize: t.size(11) }]}>
          {credit}
        </T>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    height: CARD_HEIGHT,
    borderRadius: t.radius.card,
    padding: t.space.lg,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.space.md },
  title: { fontFamily: t.fonts.bold, fontSize: t.size(16), color: '#fff' },
  expand: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    fontFamily: t.fonts.bold,
    fontSize: t.size(21),
    lineHeight: t.size(28),
    marginBottom: t.space.sm,
  },
  credit: { marginTop: t.space.sm, color: 'rgba(255,255,255,0.75)', fontFamily: t.fonts.medium },
}));
