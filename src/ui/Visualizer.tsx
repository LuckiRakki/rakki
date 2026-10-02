// A bar visualizer. From build 1.0.0 the bars follow the actual sound: the native player taps
// each song's audio and hands over band levels (low to high), read here once a frame. Where
// there are none (older builds, songs the server transcodes to HLS, AirPlay, the web preview)
// they move like music instead: a steady beat at a tempo of the song's own (from its id), low
// bars thumping on the beat and high ones shimmering. Either way they settle when paused.
// Drawn on the UI thread.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useAppActive } from '@/lib/appActive';
import { engine } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { useTheme } from '@/ui/theme';

/** A tempo between 84 and 132 BPM, the same every time for a given song. */
function tempoFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return 84 + (Math.abs(hash) % 49);
}

export function Visualizer({
  bars,
  width,
  height,
  color,
  gap = 2,
  radius = 1,
  mirrored = false,
}: {
  bars: number;
  width: number;
  height: number;
  color: string;
  gap?: number;
  radius?: number;
  /** Bars grow both ways from the middle (the lyrics panel); otherwise up from the bottom. */
  mirrored?: boolean;
}) {
  const t = useTheme();
  const playing = usePlayer((s) => s.playing);
  const songId = usePlayer((s) => s.queue[s.index]?.item.Id ?? '');
  const time = useSharedValue(0);
  const energy = useSharedValue(playing ? 1 : 0);
  const bpm = useSharedValue(tempoFor(songId));
  /** The real levels, one per bar; null: simulate. */
  const levels = useSharedValue<number[] | null>(null);
  // Never in the background: frame loops there turn into busy loops (see lib/appActive.ts).
  const active = useAppActive();
  const moving = playing && !t.reduceMotion && active;

  const frame = useFrameCallback((info) => {
    time.set(time.get() + (info.timeSincePreviousFrame ?? 16) / 1000);
  }, false);

  useEffect(() => {
    frame.setActive(moving);
    energy.set(withTiming(playing ? 1 : 0, { duration: playing ? 350 : 700 }));
  }, [moving, playing, frame, energy]);

  useEffect(() => {
    bpm.set(tempoFor(songId));
  }, [songId, bpm]);

  // Read the levels on the JS thread each frame while playing (one cheap native call).
  useEffect(() => {
    if (!moving) return;
    let raf = 0;
    const read = () => {
      levels.set(engine.getLevels(bars));
      raf = requestAnimationFrame(read);
    };
    raf = requestAnimationFrame(read);
    return () => cancelAnimationFrame(raf);
  }, [moving, bars, levels]);

  const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);
  return (
    <View
      style={{ width, height, flexDirection: 'row', alignItems: mirrored ? 'center' : 'flex-end', gap }}
      pointerEvents="none">
      {Array.from({ length: bars }, (_, i) => (
        <Bar
          key={i}
          index={i}
          count={bars}
          time={time}
          energy={energy}
          bpm={bpm}
          levels={levels}
          width={barWidth}
          height={height}
          color={color}
          radius={radius}
          mirrored={mirrored}
        />
      ))}
    </View>
  );
}

function Bar({
  index,
  count,
  time,
  energy,
  bpm,
  levels,
  width,
  height,
  color,
  radius,
  mirrored,
}: {
  index: number;
  count: number;
  time: SharedValue<number>;
  energy: SharedValue<number>;
  bpm: SharedValue<number>;
  levels: SharedValue<number[] | null>;
  width: number;
  height: number;
  color: string;
  radius: number;
  mirrored: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const real = levels.get();
    if (real) {
      const level = real[index] ?? 0;
      return { transform: [{ scaleY: 0.12 + 0.88 * Math.min(1, Math.max(0, level)) * energy.get() }] };
    }
    const t = time.get();
    const beat = (t * bpm.get()) / 60;
    // Sharp attack on each beat, then a decay; a softer off-beat in between.
    const kick = Math.exp(-(beat % 1) * 5);
    const off = Math.exp(-((beat + 0.5) % 1) * 7) * 0.45;
    const pos = count > 1 ? index / (count - 1) : 0.5; // 0 = low end, 1 = high end
    const wander =
      0.5 + 0.25 * Math.sin(t * (0.9 + index * 0.31) + index * 1.7) + 0.25 * Math.sin(t * (2.3 + index * 0.17) + index * 0.6);
    const shimmer = 0.5 + 0.5 * Math.sin(t * (6 + index * 0.83) + index * 2.9);
    const low = (0.45 + 0.55 * kick) * (0.7 + 0.3 * wander);
    const high = (0.25 + 0.35 * off + 0.4 * shimmer) * (0.6 + 0.4 * wander);
    const level = low * (1 - pos) + high * pos;
    const scale = 0.12 + 0.88 * Math.min(1, Math.max(0, level)) * energy.get();
    return { transform: [{ scaleY: scale }] };
  });
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: color, transformOrigin: mirrored ? 'center' : 'bottom' },
        style,
      ]}
    />
  );
}
