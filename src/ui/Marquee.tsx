// A one-line text that scrolls when it doesn't fit (a long song title): it rests, slides along
// until the end has come past, then rests at the start again, like Spotify. Text that fits
// stays still. Runs on the UI thread. With Reduce Motion, or Settings → Scroll long titles off,
// the end is cut off with "…" instead.
import { useEffect, useState } from 'react';
import { View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useSettings } from '@/settings/store';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

const SPEED = 32; // points per second
const REST_MS = 2600;
const GAP = 48; // between the end of the text and its copy

export function Marquee({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);
  const x = useSharedValue(0);
  const overflows = boxW > 0 && textW > boxW + 1;
  const enabled = useSettings((s) => s.scrollTitles);
  const scrolls = overflows && enabled && !t.reduceMotion;

  useEffect(() => {
    cancelAnimation(x);
    x.set(0);
    if (!scrolls) return;
    const distance = textW + GAP;
    x.set(
      withRepeat(
        withSequence(
          withDelay(REST_MS, withTiming(-distance, { duration: (distance / SPEED) * 1000, easing: Easing.linear })),
          // The copy is now exactly where the text started: jump back unseen.
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(x);
  }, [scrolls, textW, text, x]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={{ overflow: 'hidden', alignSelf: 'stretch' }} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      {/* Laid out as wide as it likes, to measure the whole title. */}
      <Animated.View style={[{ flexDirection: 'row', width: 10000, opacity: overflows && !scrolls ? 0 : 1 }, slide]}>
        <View onLayout={(e) => setTextW(e.nativeEvent.layout.width)}>
          <T numberOfLines={1} style={style}>
            {text}
          </T>
        </View>
        {scrolls ? (
          <T numberOfLines={1} style={[style, { marginLeft: GAP }]}>
            {text}
          </T>
        ) : null}
      </Animated.View>
      {/* Too long but not scrolling (Reduce Motion): cut off with an ellipsis instead. */}
      {overflows && !scrolls ? (
        <T numberOfLines={1} style={[style, { position: 'absolute', left: 0, right: 0 }]}>
          {text}
        </T>
      ) : null}
    </View>
  );
}
