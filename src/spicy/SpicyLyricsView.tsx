import { Canvas, Picture, Skia, useFont, type SkImage, type SkPicture } from '@shopify/react-native-skia';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import type { Lyrics } from '@/lyrics/types';
import { useShallow } from 'zustand/react/shallow';

import { FONT_FILES, FONTS } from '@/appearance/fonts';
import { useAppActive, useInBackground } from '@/lib/appActive';
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
/** How long everything must be still (paused, nothing moving) before drawing rests. */
const SETTLE_MS = 1500;
/** Pictures kept after they're replaced, in case the screen is a few frames behind. */
const KEEP_PICTURES = 4;
/** While resting, how often to look for play, a touch or a seek. */
const REST_CHECK_MS = 50;

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
  const away = useInBackground();

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
    let rest: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    let lastMs = -1;
    let movedAt = 0;
    const bounds = Skia.XYWHRect(0, 0, size.w, size.h);
    // One recorder for the whole screen (a new one each frame was garbage 60 times a second).
    const rec = Skia.PictureRecorder();
    // Each frame's picture holds every glyph on screen in native memory the JS garbage
    // collector can't see, and it only collects now and then: dozens of old pictures could pile
    // up and the phone ran out of memory mid-draw (the crash reports: Skia failing to allocate in
    // drawText). Old pictures are freed as soon as the screen can't still be showing them.
    const old: SkPicture[] = [];
    const frame = (t: number) => {
      const dt = last ? Math.min(t - last, 100) / 1000 : 0;
      last = t;
      const ms = nowMs();
      scene.tick(ms, dt, durationMs());
      // Paused and everything settled: the last picture stays up, and the screen just checks
      // now and then for play, a touch or a seek (each frame was ~50% CPU for nothing).
      if (ms !== lastMs || !scene.settled) movedAt = t;
      lastMs = ms;
      if (t - movedAt > SETTLE_MS) {
        rest = setTimeout(() => {
          rest = null;
          last = 0;
          raf = requestAnimationFrame(frame);
        }, REST_CHECK_MS);
        return;
      }
      scene.draw(rec.beginRecording(bounds));
      const next = rec.finishRecordingAsPicture();
      old.push(picture.value);
      picture.value = next;
      while (old.length > KEEP_PICTURES) old.shift()?.dispose();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (rest) clearTimeout(rest);
    };
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
        {/* In the background the drawing surface lets go of its memory (the scene, and where
            the lyrics were, stay). */}
        {scene && !away ? (
          <Canvas style={{ flex: 1 }}>
            <Picture picture={picture} />
          </Canvas>
        ) : null}
      </View>
    </GestureDetector>
  );
}
