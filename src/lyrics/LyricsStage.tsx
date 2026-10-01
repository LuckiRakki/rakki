import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { RegularLyricsView } from '@/lyrics/RegularLyricsView';
import type { Lyrics, LyricsBundle } from '@/lyrics/types';
import { usePlayer } from '@/player/store';
import type { LyricsMode } from '@/settings/store';
import { SpicyBackdrop } from '@/spicy/Backdrop';
import type { SpicyLayout } from '@/spicy/scene';
import { SpicyLyrics } from '@/spicy/SpicyLyrics';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { Visualizer } from '@/ui/Visualizer';

/**
 * Which lyrics each mode shows. Spicy prefers word-timed TTML (falling back to LRC, drawn
 * line-by-line in Spicy style); Regular prefers the line-timed LRC, then TTML's lines.
 * Synced always beats unsynced.
 */
export function pickLyrics(bundle: LyricsBundle | undefined, mode: LyricsMode): Lyrics | null {
  if (!bundle) return null;
  const { ttml, lrc } = bundle;
  const order = mode === 'spicy' ? [ttml, lrc] : [lrc, ttml];
  return order.find((l) => l?.isSynced) ?? order.find(Boolean) ?? null;
}

/** The sung line follows a quarter of the way down, under the album header (Spicy's compact view). */
const ANCHOR = 0.24;
const FADE_TOP = 36;

/**
 * Background + header + the chosen renderer. The header (album art, title…) sits above the
 * lyrics in the normal flow; `footerSpace` is how much of the bottom is covered by overlaid
 * controls, so the lyrics fade out before reaching them. Shared by the lyrics screen and the
 * dev demo.
 */
export function LyricsStage({
  lyrics,
  loading,
  mode,
  nowMs,
  durationMs,
  onSeek,
  artUri,
  tint,
  header,
  footerSpace = 0,
  visualizer = false,
}: {
  lyrics: Lyrics | null;
  loading: boolean;
  mode: LyricsMode;
  nowMs: () => number;
  durationMs: () => number;
  onSeek: (ms: number) => void;
  artUri?: string;
  tint: string;
  header?: ReactNode;
  footerSpace?: number;
  /** Show the visualizer instead of the lyrics. */
  visualizer?: boolean;
}) {
  const styles = useStyles();
  const layout: SpicyLayout = { anchor: ANCHOR, fadeTop: FADE_TOP, fadeBottom: footerSpace + 40 };
  return (
    <View style={StyleSheet.absoluteFill}>
      {mode === 'spicy' ? (
        <SpicyBackdrop uri={artUri} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      )}
      {header}
      <View style={{ flex: 1 }}>
        {visualizer && lyrics ? (
          <View style={[styles.empty, { paddingBottom: footerSpace }]}>
            <VisualizerPanel />
          </View>
        ) : lyrics ? (
          mode === 'spicy' ? (
            <SpicyLyrics
              key={lyricsKey(lyrics)}
              lyrics={lyrics}
              nowMs={nowMs}
              durationMs={durationMs}
              onSeek={onSeek}
              layout={layout}
            />
          ) : (
            <RegularLyricsView
              key={lyricsKey(lyrics)}
              lyrics={lyrics}
              nowMs={nowMs}
              onSeek={onSeek}
              anchor={ANCHOR}
              fadeColor={tint}
              fadeTop={FADE_TOP}
              fadeBottom={footerSpace + 40}
            />
          )
        ) : (
          <View style={[styles.empty, { paddingBottom: footerSpace }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <NoLyrics />}
          </View>
        )}
      </View>
    </View>
  );
}

/** The full-width visualizer for the lyrics panel. */
function VisualizerPanel() {
  const { width } = useWindowDimensions();
  return <Visualizer bars={28} width={width - 64} height={200} color="rgba(255,255,255,0.9)" gap={5} radius={3} mirrored />;
}

/**
 * A song without lyrics: says so, then after a second the message fades out and the
 * visualizer fades in. Starts over for each song.
 */
function NoLyrics() {
  const songId = usePlayer((s) => s.queue[s.index]?.item.Id ?? '');
  return <NoLyricsSequence key={songId} />;
}

function NoLyricsSequence() {
  const t = useTheme();
  const text = useSharedValue(1);
  const viz = useSharedValue(0);
  useEffect(() => {
    const id = setTimeout(() => {
      const quick = t.reduceMotion;
      text.set(withTiming(0, { duration: quick ? 0 : 350 }));
      viz.set(withDelay(quick ? 0 : 250, withTiming(1, { duration: quick ? 0 : 600 })));
    }, 1000);
    return () => clearTimeout(id);
  }, [text, viz, t.reduceMotion]);
  const textStyle = useAnimatedStyle(() => ({ opacity: text.get() }));
  const vizStyle = useAnimatedStyle(() => ({ opacity: viz.get() }));
  return (
    <View style={{ flex: 1, alignSelf: 'stretch' }}>
      <Animated.View style={[StyleSheet.absoluteFill, CENTER, vizStyle]}>
        <VisualizerPanel />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, CENTER, textStyle]}>
        <T variant="heading" style={{ textAlign: 'center' }}>
          No lyrics for this song
        </T>
      </Animated.View>
    </View>
  );
}

const CENTER = { alignItems: 'center', justifyContent: 'center' } as const;

function lyricsKey(l: Lyrics) {
  return `${l.kind}:${l.lines.length}:${l.lines[0]?.startMs ?? 0}:${l.lines[0]?.text ?? ''}`;
}

const useStyles = makeStyles((t) => ({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.space.xl },
}));
