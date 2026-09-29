import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { formatDuration } from '@/lib/format';
import { T } from '@/ui/T';
import { colors, space } from '@/ui/theme';

/** Spotify-style scrubber: drag or tap anywhere on the bar; seeks when you let go. */
export function SeekBar({
  position,
  duration,
  onSeek,
}: {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null);

  const ratioAt = (x: number) => Math.min(1, Math.max(0, x / width));
  const shown = scrub ?? (duration > 0 ? position / duration : 0);

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

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
          style={{ height: 24, justifyContent: 'center' }}>
          <View style={{ height: scrub !== null ? 6 : 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' }}>
            <View
              style={{
                width: `${shown * 100}%`,
                height: '100%',
                borderRadius: 3,
                backgroundColor: colors.text,
              }}
            />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: shown * width - 6,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: colors.text,
            }}
          />
        </View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs }}>
        <T variant="caption" style={{ fontSize: 12 }}>
          {formatDuration(shown * duration)}
        </T>
        <T variant="caption" style={{ fontSize: 12 }}>
          -{formatDuration(Math.max(0, duration - shown * duration))}
        </T>
      </View>
    </View>
  );
}
