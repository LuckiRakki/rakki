/** `color` with its alpha replaced (accepts "#rrggbb", "#rgb", "rgb(r, g, b)" or "rgba(...)"). */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  let r = 0, g = 0, b = 0;
  const m = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) {
    [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if (/^#([0-9a-f]{3}){1,2}$/i.test(c)) {
    const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1);
    [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type RGB = [number, number, number];

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === rf) h = ((gf - bf) / d) % 6;
    else if (max === gf) h = (bf - rf) / d + 2;
    else h = (rf - gf) / d + 4;
  }
  return [(h * 60 + 360) % 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r1)}${hex(g1)}${hex(b1)}`;
}

/**
 * An accent colour from an average art colour: same hue, pushed to a saturation and lightness
 * that read well on a dark background (album averages are often muddy or dark).
 */
export function vividAccent(rgb: RGB): string {
  const [h, s0, l0] = rgbToHsl(rgb);
  // Near-grey art stays a soft neutral instead of inventing a colour.
  const s = s0 < 0.08 ? 0.08 : Math.max(s0, 0.55);
  const l = Math.min(0.68, Math.max(0.58, l0));
  return hslToHex(h, s, l);
}

/**
 * A Spotify "Browse all" tile colour: the art's hue, saturated, dark enough for white text.
 * Without art (or with near-grey art, which has no real hue), a hue picked from `seed` so
 * each genre keeps its own colour.
 */
export function tileColor(rgb: RGB | null, seed: string): string {
  if (rgb) {
    const [h, s0] = rgbToHsl(rgb);
    if (s0 >= 0.15) return hslToHex(h, Math.max(s0, 0.6), 0.42);
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return hslToHex(Math.abs(hash) % 360, 0.6, 0.42);
}
