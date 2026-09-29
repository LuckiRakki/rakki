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
