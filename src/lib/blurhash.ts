// A blurhash's first component (chars 2-5) is the image's average colour in sRGB.
// Jellyfin sends a blurhash for every image, so this gives us an art colour without
// downloading or decoding the image.
const DIGITS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function decode83(str: string): number {
  let value = 0;
  for (const ch of str) {
    const digit = DIGITS.indexOf(ch);
    if (digit < 0) return NaN;
    value = value * 83 + digit;
  }
  return value;
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const toSrgb = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
};
const signPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

/**
 * The blurred image a blurhash describes, as a small grid of [r, g, b] (row by row): the
 * cover's main colours and where they sit. null if the hash is unusable.
 */
export function blurhashColors(hash?: string | null, width = 4, height = 4): [number, number, number][] | null {
  if (!hash || hash.length < 6) return null;
  const size = decode83(hash[0]);
  const numY = Math.floor(size / 9) + 1;
  const numX = (size % 9) + 1;
  if (!Number.isFinite(size) || hash.length !== 4 + 2 * numX * numY) return null;
  const maxValue = (decode83(hash[1]) + 1) / 166;
  const comps: [number, number, number][] = [];
  for (let i = 0; i < numX * numY; i++) {
    if (i === 0) {
      const v = decode83(hash.substring(2, 6));
      comps.push([toLinear(v >> 16), toLinear((v >> 8) & 255), toLinear(v & 255)]);
    } else {
      const v = decode83(hash.substring(4 + i * 2, 6 + i * 2));
      const q = [Math.floor(v / 361), Math.floor(v / 19) % 19, v % 19];
      comps.push(q.map((c) => signPow((c - 9) / 9, 2) * maxValue) as [number, number, number]);
    }
  }
  const out: [number, number, number][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = [0, 0, 0];
      for (let j = 0; j < numY; j++) {
        for (let i = 0; i < numX; i++) {
          const basis = Math.cos((Math.PI * (x + 0.5) * i) / width) * Math.cos((Math.PI * (y + 0.5) * j) / height);
          const c = comps[i + j * numX];
          px[0] += c[0] * basis;
          px[1] += c[1] * basis;
          px[2] += c[2] * basis;
        }
      }
      out.push([toSrgb(px[0]), toSrgb(px[1]), toSrgb(px[2])]);
    }
  }
  return out;
}

/** Average colour of a blurhash as [r, g, b], or null if the hash is unusable. */
export function blurhashAverage(hash?: string | null): [number, number, number] | null {
  if (!hash || hash.length < 6) return null;
  const value = decode83(hash.substring(2, 6));
  if (!Number.isFinite(value)) return null;
  return [value >> 16, (value >> 8) & 255, value & 255];
}

/**
 * A header/tint colour from the art: the average colour, darkened so white text on
 * top stays readable (Spotify-style album header).
 */
export function artColor(hash?: string | null, fallback = '#3a3a3a'): string {
  const rgb = blurhashAverage(hash);
  if (!rgb) return fallback;
  const [r, g, b] = rgb;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const scale = lum > 150 ? 150 / lum : 1;
  const c = (v: number) => Math.round(v * scale);
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}
