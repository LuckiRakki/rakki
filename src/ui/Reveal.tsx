// Loading in order on the phone (the plan is lib/reveal.ts, shared with the desktop): each part
// of a screen shows a placeholder of its own size while it loads (they fade in one after
// another), then fades in on its beat, top to bottom, so nothing on screen jumps. Pictures
// fade in last, over their colour (Artwork). Opacity only: nothing moves.
import { useEffect, useState, type ReactNode } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';

import type { Step } from '@/lib/reveal';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

export { gaveUp, partOf, useReveal, type Part, type Step } from '@/lib/reveal';

/** The placeholders' colour: a faint white, so it works on every background and album colour. */
export const SKEL = 'rgba(255,255,255,0.08)';

const fadeIn = (delay: number, ms = 340) =>
  FadeIn.delay(delay)
    .duration(ms)
    .easing(Easing.out(Easing.cubic));

/** A part of a screen: its placeholder while it loads, then the part itself on its beat. */
export function Reveal({
  step,
  placeholder,
  style,
  children,
}: {
  step: Step;
  placeholder?: ReactNode;
  /** For the wrapper while it fades (e.g. flex: 1 in a row). */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const t = useTheme();
  if (step.show === 'none') return null;
  if (step.show === 'placeholder') {
    if (!placeholder) return null;
    return (
      <Animated.View key="placeholder" style={style} entering={t.reduceMotion ? undefined : fadeIn(step.delay, 300)} pointerEvents="none">
        {placeholder}
      </Animated.View>
    );
  }
  if (!step.animate || t.reduceMotion) return <>{children}</>;
  return (
    <Animated.View key="content" style={style} entering={fadeIn(step.delay)}>
      {children}
    </Animated.View>
  );
}

/** Only a part's placeholder, where the part itself is drawn elsewhere (a list's rows). */
export function Hold({ step, children }: { step: Step; children: ReactNode }) {
  if (step.show !== 'placeholder') return null;
  return (
    <Reveal step={step} placeholder={children}>
      {null}
    </Reveal>
  );
}

/**
 * For the rows of a list that arrived (FlatList): the first screenful fades in on the list's
 * beat, one row after another, the first time only; rows drawn later (scrolling) are simply there.
 */
export function useRowFade(step: Step) {
  const t = useTheme();
  const fading = step.show === 'content' && step.animate && !t.reduceMotion;
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!fading) return;
    const id = setTimeout(() => setDone(true), step.delay + 900);
    return () => clearTimeout(id);
  }, [fading, step.delay]);
  return (index: number) => (fading && !done && index < 14 ? fadeIn(step.delay + index * 30, 300) : undefined);
}

/** A row of a list that fades in with `useRowFade`. */
export function FadeRow({ entering, children }: { entering: ReturnType<ReturnType<typeof useRowFade>>; children: ReactNode }) {
  if (!entering) return <>{children}</>;
  return <Animated.View entering={entering}>{children}</Animated.View>;
}

// ---- Placeholders: the real layout's sizes, with soft shapes for pictures and words ----

const WIDTHS = [72, 56, 80, 64, 70, 50, 76, 60, 66, 54];
export const barWidth = (i: number, less = 0): DimensionValue => `${WIDTHS[i % WIDTHS.length] - less}%`;

/** A shape (a cover, a button) still loading. */
export function Bone({ style }: { style: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: SKEL }, style]} />;
}

/** A line of words still loading: exactly as tall as the real line (`variant`), with a bar in it. */
export function Line({
  variant = 'body',
  width,
  style,
  center,
  size,
}: {
  variant?: 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption';
  width: DimensionValue;
  style?: StyleProp<ViewStyle>;
  center?: boolean;
  /** The real line's font size, when it overrides the variant's. */
  size?: number;
}) {
  return (
    <View style={style}>
      <T variant={variant} numberOfLines={1} style={size ? { fontSize: size } : undefined}>
        {' '}
      </T>
      <View style={{ position: 'absolute', top: '24%', bottom: '24%', left: 0, right: 0, alignItems: center ? 'center' : 'flex-start' }}>
        <View style={{ width, height: '100%', borderRadius: 4, backgroundColor: SKEL }} />
      </View>
    </View>
  );
}

/** A tile (cover, title, subtitle) still loading, the size of ItemTile (`height`: a wide picture, as videos). */
export function TileSkeleton({ size, height = size, i = 0, round }: { size: number; height?: number; i?: number; round?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ width: size }}>
      <Bone style={{ width: size, height, borderRadius: round ? size / 2 : t.radius.art }} />
      <Line variant="bodyStrong" size={t.size(14)} width={barWidth(i)} center={round} style={{ marginTop: 8 }} />
      <Line variant="caption" width={barWidth(i + 3, 18)} center={round} />
    </View>
  );
}

/** A shelf still loading: its title and a row of tiles, the size the real one will be (ui/Shelf.tsx). */
export function ShelfSkeleton({ size = 148, height, round }: { size?: number; height?: number; round?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: t.space.xl }}>
      <Line variant="heading" width="38%" style={{ marginHorizontal: t.space.lg, marginBottom: t.space.md }} />
      <View style={{ flexDirection: 'row', gap: t.space.lg, paddingHorizontal: t.space.lg, overflow: 'hidden' }}>
        {[0, 1, 2, 3].map((i) => (
          <TileSkeleton key={i} size={size} height={height} i={i} round={round} />
        ))}
      </View>
    </View>
  );
}

/** Song rows still loading, the size of TrackRow (`art`: with covers, as in playlists; `rank`: numbered, as Popular). */
export function TrackRowsSkeleton({ count, art, rank }: { count: number; art?: boolean; rank?: boolean }) {
  const t = useTheme();
  return (
    <View pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, paddingVertical: art ? t.space.sm : 10 }}>
          {rank ? <View style={{ width: 24 }} /> : null}
          {art ? <Bone style={{ width: 48, height: 48, borderRadius: t.radius.art, marginRight: t.space.md }} /> : rank ? null : <View style={{ width: 28 }} />}
          <View style={{ flex: 1, marginRight: t.space.md }}>
            <Line variant="bodyStrong" width={barWidth(i, 14)} />
            <Line variant="caption" width={barWidth(i + 4, 34)} />
          </View>
          <Line variant="caption" width={30} style={{ width: 30 }} />
        </View>
      ))}
    </View>
  );
}

/** A list row (album, artist, playlist) still loading, the size of ItemRow (`art`: a smaller picture, as genres). */
export function ItemRowSkeleton({ i = 0, round, art = 56 }: { i?: number; round?: boolean; art?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, paddingVertical: t.space.sm }}>
      <Bone style={{ width: art, height: art, borderRadius: round ? art / 2 : t.radius.art }} />
      <View style={{ flex: 1, marginLeft: t.space.md }}>
        <Line variant="bodyStrong" width={barWidth(i, 10)} />
        <Line variant="caption" width={barWidth(i + 3, 30)} />
      </View>
    </View>
  );
}

/** List rows still loading: enough to fill the screen. */
export function ItemRowsSkeleton({ count, round, art }: { count: number; round?: boolean; art?: number }) {
  return (
    <View pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <ItemRowSkeleton key={i} i={i} round={round} art={art} />
      ))}
    </View>
  );
}

/**
 * A grid of tiles still loading (the Library's grids): enough rows to fill the screen.
 * `height`: wide pictures (videos); `bare`: pictures only (genre tiles).
 */
export function GridSkeleton({
  tile,
  columns,
  gap,
  rowGap,
  rows = 3,
  round,
  height,
  bare,
}: {
  tile: number;
  columns: number;
  gap: number;
  rowGap: number;
  rows?: number;
  round?: boolean;
  height?: number;
  bare?: boolean;
}) {
  const t = useTheme();
  return (
    <View pointerEvents="none" style={{ gap: rowGap }}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap, paddingHorizontal: t.space.lg }}>
          {Array.from({ length: columns }, (_, c) =>
            bare ? (
              <Bone key={c} style={{ width: tile, height: height ?? tile, borderRadius: t.radius.art }} />
            ) : (
              <TileSkeleton key={c} size={tile} height={height} i={r * columns + c} round={round} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/** Genre pills still loading (GenreChips' row). */
export function ChipsSkeleton() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: t.space.sm, marginTop: t.space.md }} pointerEvents="none">
      {[74, 92, 64].map((w) => (
        <Bone key={w} style={{ width: w, height: 28, borderRadius: t.radius.pill }} />
      ))}
    </View>
  );
}
