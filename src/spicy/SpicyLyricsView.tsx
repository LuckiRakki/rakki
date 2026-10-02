import { Canvas, Picture, Skia, useFont, type SkImage, type SkPicture } from '@shopify/react-native-skia';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import type { Lyrics } from '@/lyrics/types';
import { useShallow } from 'zustand/react/shallow';

import { FONT_FILES, FONTS } from '@/appearance/fonts';
import { useAppActive } from '@/lib/appActive';
import { useLyricsStyle } from '@/lyrics/style';
import { SPICY_LAYOUT_DEFAULTS, SpicyScene, type SpicyLayout } from '@/spicy/scene';
import { useTheme } from '@/ui/theme';


function emptyPicture(): SkPicture {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return rec.finishRecordingAsPicture();
}

/**
 * Spicy mode: the full word-by-word engine drawn with Skia. Each animation frame advances
 * the scene to the current playback time and records a fresh Skia picture of it.
 */
/** Credits' profile pictures, kept for the session. */
const avatarCache = new Map<string, SkImage>();

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
  const t = useTheme();
  const style = useLyricsStyle(
    useShallow((s) => ({ spicy: s.spicy, scale: s.spicySize, font: s.spicyFont, color: s.spicyColor })),
  );
  const faces = style.font === 'app' ? (FONTS[t.appearance.font]?.faces ?? FONTS.inter.faces) : FONTS.inter.faces;
  const files = FONT_FILES as Record<string, number>;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fontSize = Math.max(26, Math.min(44, size.w * 0.08)) * style.scale;
  const lead = useFont(files[faces.bold], fontSize);
  const bg = useFont(files[faces.semibold], fontSize * 0.75);
  const credits = useFont(files[faces.semibold], 16);
  const settings = useMemo(
    () => ({ ...style.spicy, color: style.color === 'accent' ? t.colors.accent : '#ffffff' }),
    [style.spicy, style.color, t.colors.accent],
  );
  const picture = useSharedValue<SkPicture>(emptyPicture());
  // Drawing stops in the background (a frame loop there is a busy loop; see lib/appActive.ts).
  const active = useAppActive();

  const scene = useMemo(
    () =>
      lead && bg && credits && size.w > 0 && size.h > 0
        ? new SpicyScene(lyrics, { lead, bg, credits }, size.w, size.h, settings, {
            anchor: layout.anchor,
            fadeTop: layout.fadeTop,
            fadeBottom: layout.fadeBottom,
          })
        : null,
    [lyrics, lead, bg, credits, size.w, size.h, settings, layout.anchor, layout.fadeTop, layout.fadeBottom],
  );

  useEffect(() => {
    if (!scene || !active) return;
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
  }, [scene, active, size.w, size.h, nowMs, durationMs, picture]);

  // Credits' profile pictures: loaded once per URL, handed to each new scene.
  useEffect(() => {
    if (!scene) return;
    let alive = true;
    for (const url of scene.avatarUrls()) {
      const cached = avatarCache.get(url);
      if (cached) {
        scene.setImage(url, cached);
        continue;
      }
      Skia.Data.fromURI(url)
        .then((data) => {
          const image = Skia.Image.MakeImageFromEncoded(data);
          if (!image) return;
          avatarCache.set(url, image);
          if (alive) scene.setImage(url, image);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [scene]);

  const gesture = Gesture.Exclusive(
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(8)
      .onBegin(() => scene?.holdScroll())
      .onChange((e) => scene?.scrollBy(e.changeY))
      // Let go: keep scrolling and slow down, like a normal list.
      .onEnd((e) => scene?.fling(e.velocityY)),
    Gesture.Tap()
      .runOnJS(true)
      .onBegin(() => scene?.holdScroll())
      .onEnd((e) => {
        const link = scene?.linkAt(e.x, e.y);
        if (link) {
          void WebBrowser.openBrowserAsync(link);
          return;
        }
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
