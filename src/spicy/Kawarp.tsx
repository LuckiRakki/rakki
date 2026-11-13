// Kawarp on the phone: the playing cover bent like liquid, as on the desktop. A port of Better
// Lyrics' Kawarp (@kawarp/core 1.3.1, MIT, the library the desktop uses through WebGL) to Skia.
//
// Why it's light: the cover is blurred once per song, on a 128 point square, off screen. After
// that each frame is one pass of a small shader that bends that little blurred picture across the
// screen (two layers of slow noise) at half resolution, so nothing big is blurred live and only one
// small texture is kept. Every copy of the backdrop (each screen has its own) shares the same blurred picture.
import {
  Canvas,
  FilterMode,
  Fill,
  ImageShader,
  MipmapMode,
  Shader,
  Skia,
  TileMode,
  type SkImage,
} from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useDerivedValue, useSharedValue, withTiming, Easing, type SharedValue } from 'react-native-reanimated';

/** The blurred picture's side, in pixels, as in Kawarp (it's a blur: small is enough). */
const SIZE = 128;
/** Kawarp's 8 Kawase passes (offsets 0.5 to 7.5 texels) spread about as far as this Gaussian. */
const SIGMA = 13;
/** Drawn at half the screen's resolution and stretched, like the desktop's (it's a blur). */
const SCALE = 0.5;
/** Movement 1× flows like the desktop's Lively setting. */
const SPEED = 0.5;

/** Where the live blur used to darken the colours (iOS's dark material), so text reads the same. */
export const KAWARP_DIM = 'rgba(0, 0, 0, 0.3)';

// Kawarp's domain warp and output shaders in one pass: bend, then vignette, saturation and a
// little dithering (so the soft gradients don't band). `a` fades into `b` as `fade` goes 0 → 1.
const WARP = Skia.RuntimeEffect.Make(`
uniform shader a;
uniform shader b;
uniform float2 res;
uniform float time;
uniform float fade;

float3 mod289(float3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float2 mod289(float2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float3 permute(float3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(float2 v) {
  const float4 C = float4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  float2 i = floor(v + dot(v, C.yy));
  float2 x0 = v - i + dot(i, C.xx);
  float2 i1 = (x0.x > x0.y) ? float2(1.0, 0.0) : float2(0.0, 1.0);
  float4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  float3 p = permute(permute(i.y + float3(0.0, i1.y, 1.0)) + i.x + float3(0.0, i1.x, 1.0));
  float3 m = max(0.5 - float3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  float3 x = 2.0 * fract(p * C.www) - 1.0;
  float3 h = abs(x) - 0.5;
  float3 ox = floor(x + 0.5);
  float3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  float3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float hash(float3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

half4 main(float2 pos) {
  float2 uv = pos / res;
  float t = time * 0.05;
  float2 center = uv - 0.5;
  float centerWeight = 1.0 - smoothstep(0.0, 0.7, length(center));
  float n1 = snoise(uv * 0.35 + float2(t, t * 0.7));
  float n2 = snoise(uv * 0.35 + float2(-t * 0.8, t * 0.5) + float2(50.0, 50.0));
  float n3 = snoise(uv * 0.9 + float2(t * 1.2, -t) + float2(100.0, 0.0));
  float n4 = snoise(uv * 0.9 + float2(-t, t * 1.1) + float2(0.0, 100.0));
  float2 warp = float2(n1 * 0.65 + n3 * 0.35, n2 * 0.65 + n4 * 0.35) * centerWeight;
  float2 at = clamp(uv + warp, 0.0, 1.0) * ${SIZE}.0;
  half4 color = mix(a.eval(at), b.eval(at), fade);
  color.rgb *= 1.0 - dot(center, center) * 0.3;
  float gray = dot(color.rgb, half3(0.299, 0.587, 0.114));
  color.rgb = mix(half3(gray), color.rgb, 1.5);
  color.rgb += (hash(float3(floor(pos), floor(time * 60.0))) - 0.5) * 0.008;
  return half4(clamp(color.rgb, 0.0, 1.0), 1.0);
}
`)!;

// The blurred pictures, shared by every copy and kept for the last few covers (each is 64 KB).
const blurred = new Map<string, SkImage>();
const pending = new Map<string, Promise<SkImage | null>>();
const KEEP = 4;

function blurCover(uri: string, sigma: number): Promise<SkImage | null> {
  const key = `${sigma}|${uri}`;
  const done = blurred.get(key);
  if (done) {
    // Most recently used goes last, so the oldest leaves first.
    blurred.delete(key);
    blurred.set(key, done);
    return Promise.resolve(done);
  }
  const waiting = pending.get(key);
  if (waiting) return waiting;
  const job = Skia.Data.fromURI(uri)
    .then((data) => {
      const cover = Skia.Image.MakeImageFromEncoded(data);
      if (!cover) return null;
      // Drawn small with the blur on the way in; Clamp keeps the edges from fading to black.
      const surface = Skia.Surface.Make(SIZE, SIZE);
      if (!surface) return null;
      const paint = Skia.Paint();
      paint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, null));
      surface
        .getCanvas()
        .drawImageRect(cover, Skia.XYWHRect(0, 0, cover.width(), cover.height()), Skia.XYWHRect(0, 0, SIZE, SIZE), paint);
      surface.flush();
      const image = surface.makeImageSnapshot();
      cover.dispose();
      surface.dispose();
      blurred.set(key, image);
      while (blurred.size > KEEP) blurred.delete(blurred.keys().next().value!);
      return image;
    })
    .catch(() => null)
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None };

/**
 * Kawarp filling what holds it. `clock` is seconds of motion (already scaled by Movement);
 * `blur` scales how soft the colours are (1 = Kawarp's). A new cover fades in over `fade` ms.
 * Draws nothing until the first cover is ready, so the colour behind it shows.
 */
export function Kawarp({ uri, clock, blur = 1, fade = 0 }: { uri: string; clock: SharedValue<number>; blur?: number; fade?: number }) {
  const [pics, setPics] = useState<{ from: SkImage | null; to: SkImage } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const mix = useSharedValue(1);
  const sigma = Math.round(SIGMA * blur);

  useEffect(() => {
    let alive = true;
    void blurCover(uri, sigma).then((image) => {
      if (!alive || !image) return;
      setPics((was) => {
        if (was?.to === image) return was;
        mix.set(0);
        mix.set(withTiming(1, { duration: was ? fade : 0, easing: Easing.inOut(Easing.sin) }));
        return { from: was?.to ?? null, to: image };
      });
    });
    return () => {
      alive = false;
    };
  }, [uri, sigma, fade, mix]);

  const uniforms = useDerivedValue(() => ({
    res: [Math.max(1, size.width * SCALE), Math.max(1, size.height * SCALE)],
    time: clock.get() * SPEED,
    fade: mix.get(),
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {pics && size.width > 0 ? (
        <Canvas
          style={{
            position: 'absolute',
            width: size.width * SCALE,
            height: size.height * SCALE,
            left: (size.width * (1 - SCALE)) / 2,
            top: (size.height * (1 - SCALE)) / 2,
            transform: [{ scale: 1 / SCALE }],
          }}>
          <Fill>
            <Shader source={WARP} uniforms={uniforms}>
              <ImageShader image={pics.from ?? pics.to} x={0} y={0} width={SIZE} height={SIZE} fit="fill" tx="clamp" ty="clamp" sampling={SAMPLING} />
              <ImageShader image={pics.to} x={0} y={0} width={SIZE} height={SIZE} fit="fill" tx="clamp" ty="clamp" sampling={SAMPLING} />
            </Shader>
          </Fill>
        </Canvas>
      ) : null}
    </View>
  );
}
