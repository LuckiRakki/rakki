import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useTheme } from '@/ui/theme';

const THUMB = 22;

/** Calls `fn` at most every `ms` (for live updates while dragging). */
function throttled(ms: number) {
  let last = 0;
  return (fn: () => void) => {
    const now = Date.now();
    if (now - last > ms) {
      last = now;
      fn();
    }
  };
}

/**
 * A horizontal slider: drag or tap. While dragging it shows the value straight away and
 * updates the setting a few times a second, so the app restyles live.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const live = useMemo(() => throttled(150), []);

  const toValue = (x: number) => {
    const raw = min + (Math.max(0, Math.min(width, x)) / Math.max(1, width)) * (max - min);
    return Math.round(Math.round(raw / step) * step * 1000) / 1000;
  };
  const shown = dragging ?? value;
  const pct = (Math.max(min, Math.min(max, shown)) - min) / (max - min);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const v = toValue(e.x);
      setDragging(v);
      live(() => onChange(v));
    })
    .onEnd((e) => onChange(toValue(e.x)))
    .onFinalize(() => setDragging(null));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => onChange(toValue(e.x)));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: 36, justifyContent: 'center' }}
        accessibilityRole="adjustable"
        accessibilityValue={{ min, max, now: shown }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: t.colors.surface3 }}>
          <View style={{ height: 4, borderRadius: 2, width: `${pct * 100}%`, backgroundColor: t.colors.accent }} />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: pct * Math.max(0, width) - THUMB / 2,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: t.colors.text,
          }}
        />
      </View>
    </GestureDetector>
  );
}
