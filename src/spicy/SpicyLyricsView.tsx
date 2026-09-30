import { Canvas, Picture, Skia, useFont, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import type { Lyrics } from '@/lyrics/types';
import { SPICY_DEFAULTS, SPICY_LAYOUT_DEFAULTS, SpicyScene, type SpicyLayout } from '@/spicy/scene';

const INTER_BOLD = require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf');
const INTER_SEMIBOLD = require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf');

function emptyPicture(): SkPicture {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return rec.finishRecordingAsPicture();
}

/**
 * Spicy mode: the full word-by-word engine drawn with Skia. Each animation frame advances
 * the scene to the current playback time and records a fresh Skia picture of it.
 */
export function SpicyLyricsView({
  lyrics,
  nowMs,
  durationMs,
  onSeek,
  layout = SPICY_LAYOUT_DEFAULTS,
}: {
  lyrics: Lyrics;
  nowMs: () => number;
  durationMs: () => number;
  onSeek: (ms: number) => void;
  /** Where the sung line follows and how far the edges fade (see SpicyLayout). */
  layout?: SpicyLayout;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fontSize = Math.max(26, Math.min(44, size.w * 0.08));
  const lead = useFont(INTER_BOLD, fontSize);
  const bg = useFont(INTER_SEMIBOLD, fontSize * 0.75);
  const credits = useFont(INTER_SEMIBOLD, 16);
  const picture = useSharedValue<SkPicture>(emptyPicture());

  const scene = useMemo(
    () =>
      lead && bg && credits && size.w > 0 && size.h > 0
        ? new SpicyScene(lyrics, { lead, bg, credits }, size.w, size.h, SPICY_DEFAULTS, {
            anchor: layout.anchor,
            fadeTop: layout.fadeTop,
            fadeBottom: layout.fadeBottom,
          })
        : null,
    [lyrics, lead, bg, credits, size.w, size.h, layout.anchor, layout.fadeTop, layout.fadeBottom],
  );

  useEffect(() => {
    if (!scene) return;
    let raf = 0;
    let last = 0;
    const bounds = Skia.XYWHRect(0, 0, size.w, size.h);
    const frame = (t: number) => {
      const dt = last ? (t - last) / 1000 : 0;
      last = t;
      scene.tick(nowMs(), dt, durationMs());
      const rec = Skia.PictureRecorder();
      scene.draw(rec.beginRecording(bounds));
      picture.value = rec.finishRecordingAsPicture();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [scene, size.w, size.h, nowMs, durationMs, picture]);

  const gesture = Gesture.Exclusive(
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(8)
      .onChange((e) => scene?.scrollBy(e.changeY)),
    Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        const ms = scene?.seekTimeAt(e.y);
        if (ms !== null && ms !== undefined) onSeek(ms);
      }),
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={{ flex: 1 }}
        onLayout={(e: LayoutChangeEvent) =>
          setSize({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })
        }>
        {scene ? (
          <Canvas style={{ flex: 1 }}>
            <Picture picture={picture} />
          </Canvas>
        ) : null}
      </View>
    </GestureDetector>
  );
}
