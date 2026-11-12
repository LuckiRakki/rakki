import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { formatDuration } from '@/lib/format';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/**
 * Rakki 2.0's clean play bar (like iOS Now Playing): elapsed time on the left, a thick rounded track with no
 * handle, time left on the right. Drag or tap anywhere on the track; it seeks when you let go.
 */
export function SeekBar({
  position,
  duration,
  onSeek,
  size = 'large',
}: {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  /** 'small' is the lyrics screen's and the video's bar. */
  size?: 'large' | 'small';
}) {
  const t = useTheme();
  const [width, setWidth] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null);

  const ratioAt = (x: number) => Math.min(1, Math.max(0, x / width));
  const shown = scrub ?? (duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0);
  const track = size === 'large' ? 8 : 6;
  const h = scrub !== null ? track + 4 : track;
  const font = t.size(size === 'large' ? 13 : 12);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .hitSlop({ top: 14, bottom: 14 })
    .onBegin((e) => setScrub(ratioAt(e.x)))
    .onUpdate((e) => setScrub(ratioAt(e.x)))
    .onEnd((e) => {
      if (duration > 0) onSeek(ratioAt(e.x) * duration);
    })
    .onFinalize(() => setScrub(null));

  const time = { fontSize: font, fontFamily: t.fonts.semibold, color: t.colors.textSecondary, fontVariant: ['tabular-nums' as const] };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size === 'large' ? 12 : 10 }}>
      <T style={[time, { minWidth: 36 }]}>{formatDuration(shown * duration)}</T>
      <GestureDetector gesture={pan}>
        <View
          onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
          accessibilityRole="adjustable"
          accessibilityLabel="Position"
          style={{ flex: 1, height: 24, justifyContent: 'center' }}>
          <View style={{ height: h, borderRadius: h / 2, backgroundColor: 'rgba(255,255,255,0.24)', overflow: 'hidden' }}>
            <View style={{ width: `${shown * 100}%`, height: '100%', backgroundColor: t.colors.text }} />
          </View>
        </View>
      </GestureDetector>
      <T style={[time, { minWidth: 36, textAlign: 'right' }]}>-{formatDuration(Math.max(0, duration - shown * duration))}</T>
    </View>
  );
}
