// A photo that fades into whatever is behind it at the bottom, with no edge: the artist page's
// hero. A gradient laid over a picture can only darken it to one colour, which never matches a
// moving Kawarp backdrop, so the photo itself turns see-through toward the bottom (a Skia alpha
// mask, drawn as dstIn over one layer). The album colour waits behind it while it loads, faded the same way.
import { Canvas, Group, Image, LinearGradient, Rect, useImage, vec } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { useSharedValue, withTiming } from 'react-native-reanimated';

/** How see-through the photo is going down (eased, so the fade has no visible start or end). */
const FADE = [1, 1, 0.86, 0.55, 0.22, 0.05, 0];
const FADE_AT = [0, 0.5, 0.62, 0.74, 0.86, 0.95, 1];
const MASK_COLORS = FADE.map((a) => `rgba(255,255,255,${a})`);

/**
 * `uri` filling `width` × `height` (cover). It is solid down to half its height, then fades out;
 * `shade` darkens it toward the bottom so white text over it reads.
 */
export function FadedPhoto({
  uri,
  width,
  height,
  tint,
  shade = 0.55,
}: {
  uri: string | undefined;
  width: number;
  height: number;
  tint: string;
  shade?: number;
}) {
  const image = useImage(uri ?? null);
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(image ? withTiming(1, { duration: 220 }) : 0);
  }, [image, shown]);

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      {/* One layer: the colour, the photo and the shade, then the fade cuts its alpha (dstIn). */}
      <Group layer>
        <Rect x={0} y={0} width={width} height={height} color={tint} />
        {image ? <Image image={image} x={0} y={0} width={width} height={height} fit="cover" opacity={shown} /> : null}
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.2)', `rgba(0,0,0,${shade})`, `rgba(0,0,0,${shade})`]}
            positions={[0, 0.35, 0.68, 1]}
          />
        </Rect>
        <Rect x={0} y={0} width={width} height={height} blendMode="dstIn">
          <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={MASK_COLORS} positions={FADE_AT} />
        </Rect>
      </Group>
    </Canvas>
  );
}
