import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { RegularLyricsView } from '@/lyrics/RegularLyricsView';
import type { Lyrics, LyricsBundle } from '@/lyrics/types';
import type { LyricsMode } from '@/settings/store';
import { SpicyBackdrop } from '@/spicy/Backdrop';
import type { SpicyLayout } from '@/spicy/scene';
import { SpicyLyrics } from '@/spicy/SpicyLyrics';
import { T } from '@/ui/T';
import { space } from '@/ui/theme';

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
}) {
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
        {lyrics ? (
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
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <T variant="heading" style={{ textAlign: 'center' }}>
                No lyrics for this song
              </T>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function lyricsKey(l: Lyrics) {
  return `${l.kind}:${l.lines.length}:${l.lines[0]?.startMs ?? 0}:${l.lines[0]?.text ?? ''}`;
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
