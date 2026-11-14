// The big visualizer (2.2): the sound drawn as the desktop draws it, by default its thin line with
// a faint mirror under it in the accent colour, or as area or bars (Settings → Look → Visualizer,
// appearance/visualizer.ts). The native player hands over 32 band levels, low to high (see
// ui/Visualizer.tsx for where there are none: then it moves like music). Drawn with Skia on the UI
// thread; it only runs while music plays and Rakki is on screen, and falls to rest when paused.
import { Canvas, Group, LinearGradient, Path, vec, usePathValue, type SkPathBuilder } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';

import type { VisualizerLook } from '@/appearance/visualizer';
import { useAppActive } from '@/lib/appActive';
import { mix } from '@/lib/color';
import { engine } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { useTheme } from '@/ui/theme';
import { fakeLevel, tempoFor } from '@/ui/Visualizer';

/** The bands the phone hears (modules/rakki-audio RakkiLevels: 40 Hz to 16 kHz). */
const BANDS = 32;
/** How see-through the mirror is (the desktop's 0.1 is too faint over Kawarp on a phone). */
const MIRROR_ALPHA = 0.15;
/** Paused: it keeps drawing this long so it falls to rest, then holds still. */
const SETTLE_MS = 1200;

/** Colours top to bottom (or left to right for Rainbow), as audioMotion's gradients the desktop uses. */
function paintFor(look: VisualizerLook, accent: string): { colors: string[]; positions: number[]; across: boolean } {
  switch (look.colors) {
    case 'mono':
      return { colors: ['#ffffff', '#ffffff', '#757575'], positions: [0, 0.7, 1], across: false };
    case 'prism':
      return { colors: ['#ff0000', '#ffff00', '#00ff00', '#00f0f0', '#2929ff'], positions: [0, 0.25, 0.5, 0.75, 1], across: false };
    case 'rainbow':
      return {
        colors: ['#ff0000', '#ffff00', '#00ff00', '#00f0f0', '#2929ff', '#ff00ff', '#ff0000'],
        positions: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1],
        across: true,
      };
    default: {
      const light = mix(accent, '#ffffff', 0.45);
      return { colors: [light, light, accent], positions: [0, 0.7, 1], across: false };
    }
  }
}

export function SoundGraph({
  width,
  height,
  look: chosen,
  demo = false,
}: {
  width: number;
  height: number;
  look?: VisualizerLook;
  /** A settings preview: with nothing playing it moves like music anyway, so the look shows. */
  demo?: boolean;
}) {
  const t = useTheme();
  const look = chosen ?? t.appearance.visualizer;
  const musicPlaying = usePlayer((s) => s.playing);
  const showing = demo && !musicPlaying;
  const playing = musicPlaying || showing;
  const songId = usePlayer((s) => s.queue[s.index]?.item.Id ?? '');
  // Never in the background: frame loops there turn into busy loops (see lib/appActive.ts).
  const active = useAppActive();
  const moving = playing && active && !t.reduceMotion;
  // Paused: it keeps drawing a moment so it falls to rest, then holds still.
  const [rested, setRested] = useState(!moving);
  if (moving && rested) setRested(false);
  useEffect(() => {
    if (moving) return;
    const id = setTimeout(() => setRested(true), SETTLE_MS);
    return () => clearTimeout(id);
  }, [moving]);
  const run = active && !t.reduceMotion && (moving || !rested);

  const count = look.style === 'bars' ? look.bars : BANDS;
  const time = useSharedValue(0);
  const energy = useSharedValue(playing ? 1 : 0);
  const bpm = useSharedValue(tempoFor(songId));
  const smoothing = useSharedValue(look.smoothing);
  const bands = useSharedValue(count);
  /** The real levels from the native player, one per band; null: simulate. */
  const levels = useSharedValue<number[] | null>(null);
  /** What's drawn: eased levels, and the peaks held above them. */
  const shown = useSharedValue<number[]>([]);
  const peaks = useSharedValue<number[]>([]);
  const holds = useSharedValue<number[]>([]);

  useEffect(() => {
    energy.set(withTiming(playing ? 1 : 0, { duration: playing ? 350 : 700 }));
  }, [playing, energy]);
  useEffect(() => {
    bpm.set(tempoFor(songId));
  }, [songId, bpm]);
  useEffect(() => {
    smoothing.set(look.smoothing);
    bands.set(count);
  }, [look.smoothing, count, smoothing, bands]);

  const frame = useFrameCallback((info) => {
    const dt = Math.min(0.1, (info.timeSincePreviousFrame ?? 16) / 1000);
    const now = time.get() + dt;
    time.set(now);
    const n = bands.get();
    const real = levels.get();
    const prev = shown.get();
    const pk = peaks.get();
    const hd = holds.get();
    // Frame-rate independent: 0.6 keeps 60% of the last frame at 60 fps, like the desktop's.
    const k = 1 - Math.pow(smoothing.get(), dt * 60);
    const e = energy.get();
    const next: number[] = new Array(n);
    const nextPk: number[] = new Array(n);
    const nextHd: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const raw = real ? (real[i] ?? 0) : fakeLevel(i, n, now, bpm.get());
      const target = Math.min(1, Math.max(0, raw)) * e;
      const was = prev[i] ?? 0;
      const v = was + (target - was) * k;
      next[i] = v;
      const p = pk[i] ?? 0;
      const h = hd[i] ?? 0;
      if (v >= p) {
        nextPk[i] = v;
        nextHd[i] = 0.6;
      } else if (h > 0) {
        nextPk[i] = p;
        nextHd[i] = h - dt;
      } else {
        nextPk[i] = Math.max(v, p - dt * 0.9);
        nextHd[i] = 0;
      }
    }
    shown.set(next);
    peaks.set(nextPk);
    holds.set(nextHd);
  }, false);

  useEffect(() => {
    frame.setActive(run);
  }, [run, frame]);

  // Read the real levels on the JS thread each frame while drawing (one cheap native call).
  useEffect(() => {
    if (showing) levels.set(null);
    if (!run || showing) return;
    let raf = 0;
    const read = () => {
      levels.set(engine.getLevels(count));
      raf = requestAnimationFrame(read);
    };
    raf = requestAnimationFrame(read);
    return () => cancelAnimationFrame(raf);
  }, [run, showing, count, levels]);

  const bars = look.style === 'bars';
  const lineWidth = look.lineWidth;
  // The graph takes the top; the mirror the rest. A line keeps its width inside the box.
  const mirrorH = height * look.reflection;
  const base = height - mirrorH - (bars ? 0 : lineWidth / 2);
  const graphH = base - (bars ? 4 : lineWidth);
  const pad = bars ? 0 : lineWidth / 2;
  const gap = bars ? Math.max(2, (width / count) * 0.25) : 0;

  const line = usePathValue((b: SkPathBuilder) => {
    'worklet';
    if (!bars) traceLine(b, shown.get(), width, pad, base, graphH, false);
  });
  const area = usePathValue((b: SkPathBuilder) => {
    'worklet';
    if (!bars) traceLine(b, shown.get(), width, pad, base, graphH, true);
  });
  const blocks = usePathValue((b: SkPathBuilder) => {
    'worklet';
    if (bars) traceBars(b, shown.get(), width, gap, base, graphH);
  });
  const tops = usePathValue((b: SkPathBuilder) => {
    'worklet';
    if (!look.peaks) return;
    if (bars) tracePeaks(b, peaks.get(), width, gap, base, graphH);
    else traceLine(b, peaks.get(), width, pad, base, graphH, false);
  });

  const paint = paintFor(look, t.colors.accent);
  const shader = () => (
    <LinearGradient
      start={vec(0, 0)}
      end={paint.across ? vec(width, 0) : vec(0, base)}
      colors={paint.colors}
      positions={paint.positions}
    />
  );
  const graph = (
    <Group>
      {!bars && look.fill > 0 ? (
        <Path path={area} opacity={look.fill}>
          {shader()}
        </Path>
      ) : null}
      {bars ? (
        <Path path={blocks} opacity={Math.max(0.15, look.fill)}>
          {shader()}
        </Path>
      ) : (
        <Path path={line} style="stroke" strokeWidth={lineWidth} strokeJoin="round" strokeCap="round">
          {shader()}
        </Path>
      )}
      {look.peaks ? (
        bars ? (
          <Path path={tops}>{shader()}</Path>
        ) : (
          <Path path={tops} style="stroke" strokeWidth={1} opacity={0.5}>
            {shader()}
          </Path>
        )
      ) : null}
    </Group>
  );
  const scale = graphH > 0 ? mirrorH / (height - mirrorH) : 0;

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      {graph}
      {mirrorH > 0 ? (
        <Group transform={[{ translateY: base }, { scaleY: -scale }, { translateY: -base }]} opacity={MIRROR_ALPHA}>
          {graph}
        </Group>
      ) : null}
    </Canvas>
  );
}

/** A smooth line through the levels (Catmull-Rom as Béziers), or the area under it when `closed`. */
function traceLine(b: SkPathBuilder, v: number[], width: number, pad: number, base: number, graphH: number, closed: boolean) {
  'worklet';
  const n = v.length;
  if (n < 2) {
    b.moveTo(pad, base);
    b.lineTo(width - pad, base);
    return;
  }
  const step = (width - pad * 2) / (n - 1);
  const x = (i: number) => pad + i * step;
  const y = (i: number) => base - Math.min(1, Math.max(0, v[Math.min(n - 1, Math.max(0, i))] ?? 0)) * graphH;
  b.moveTo(x(0), y(0));
  for (let i = 0; i < n - 1; i++) {
    const c1x = x(i) + step / 3;
    const c1y = y(i) + (y(i + 1) - y(i - 1)) / 6;
    const c2x = x(i + 1) - step / 3;
    const c2y = y(i + 1) - (y(i + 2) - y(i)) / 6;
    b.cubicTo(c1x, Math.min(base, c1y), c2x, Math.min(base, c2y), x(i + 1), y(i + 1));
  }
  if (closed) {
    b.lineTo(x(n - 1), base);
    b.lineTo(x(0), base);
    b.close();
  }
}

/** Rounded bars up from the base. */
function traceBars(b: SkPathBuilder, v: number[], width: number, gap: number, base: number, graphH: number) {
  'worklet';
  const n = v.length;
  if (!n) return;
  const w = Math.max(1, (width - gap * (n - 1)) / n);
  const r = Math.min(w / 2, 3);
  for (let i = 0; i < n; i++) {
    const h = Math.max(2, Math.min(1, Math.max(0, v[i] ?? 0)) * graphH);
    b.addRRect({ rect: { x: i * (w + gap), y: base - h, width: w, height: h }, rx: Math.min(r, h / 2), ry: Math.min(r, h / 2) });
  }
}

/** A thin mark over each bar at its held peak. */
function tracePeaks(b: SkPathBuilder, v: number[], width: number, gap: number, base: number, graphH: number) {
  'worklet';
  const n = v.length;
  if (!n) return;
  const w = Math.max(1, (width - gap * (n - 1)) / n);
  for (let i = 0; i < n; i++) {
    const p = Math.min(1, Math.max(0, v[i] ?? 0));
    if (p < 0.02) continue;
    b.addRRect({ rect: { x: i * (w + gap), y: base - p * graphH - 5, width: w, height: 2.5 }, rx: 1.25, ry: 1.25 });
  }
}
