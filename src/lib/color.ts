/** [r, g, b] of "#rrggbb", "#rgb", "rgb(r, g, b)" or "rgba(...)" (black if unreadable). */
export function parseColor(color: string): [number, number, number] {
  const c = color.trim();
  const m = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  if (/^#([0-9a-f]{3}){1,2}$/i.test(c)) {
    const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }
  return [0, 0, 0];
}

/** True for a valid "#rrggbb" or "#rgb". */
export function isHexColor(s: string): boolean {
  return /^#([0-9a-f]{3}){1,2}$/i.test(s.trim());
}

/** `color` with its alpha replaced (accepts "#rrggbb", "#rgb", "rgb(r, g, b)" or "rgba(...)"). */
export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** `a` blended towards `b` by `amount` (0 = a, 1 = b), as "#rrggbb". */
export function mix(a: string, b: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount));
  const ca = parseColor(a);
  const cb = parseColor(b);
  const hex = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * t).toString(16).padStart(2, '0');
  return `#${hex(0)}${hex(1)}${hex(2)}`;
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
 * A widget's background from its album cover's colours: the brightest, most colourful one on
 * top (kept mid-tone so text stays readable) fading into the darkest one, held dark but in its
 * own hue so it never turns flat black. Covers without colour get a deep grey-blue.
 */
export function widgetGradient(colors: RGB[] | null, seed: string): [string, string] {
  const hsl = (colors ?? []).map(rgbToHsl);
  if (!hsl.length) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    hsl.push([Math.abs(hash) % 360, 0.45, 0.4]);
  }
  // Brightest + most colourful: lightness counts, saturation counts more.
  const primary = hsl.reduce((a, b) => (b[2] + b[1] * 1.4 > a[2] + a[1] * 1.4 ? b : a));
  const darkest = hsl.reduce((a, b) => (b[2] < a[2] ? b : a));
  const grey = (c: [number, number, number]) => c[1] < 0.12;
  const [h1, s1, l1] = grey(primary) ? [220, 0.12, primary[2]] : primary;
  // A colourless darkest patch takes the primary's hue, so the fade stays in one family.
  const [h2, s2] = grey(darkest) ? [h1, Math.min(s1, 0.4)] : darkest;
  return [
    hslToHex(h1, Math.min(Math.max(s1, grey(primary) ? s1 : 0.35), 0.75), Math.min(Math.max(l1, 0.34), 0.5)),
    hslToHex(h2, Math.min(Math.max(s2, 0.25), 0.6), Math.min(Math.max(darkest[2], 0.1), 0.18)),
  ];
}

/** WCAG relative luminance of a colour (0 black to 1 white). */
export function luminance(color: string): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseColor(color);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1 to 21); 4.5 is the floor for normal text. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** The lightest dark surface accent text sits on (hovered rows, pills): what the accent must read on. */
const ACCENT_SURFACE = '#26262a';

/**
 * An accent colour from an average art colour: same hue, pushed to a saturation and lightness
 * that read well on a dark background (album averages are often muddy or dark), then lightened
 * until it reads as text on Rakki's surfaces (4.5:1): strong blues and purples otherwise don't.
 * Black text reads on any result.
 */
export function vividAccent(rgb: RGB): string {
  const [h, s0, l0] = rgbToHsl(rgb);
  // Near-grey art stays a soft neutral instead of inventing a colour.
  const s = s0 < 0.08 ? 0.08 : Math.max(s0, 0.55);
  let l = Math.min(0.68, Math.max(0.58, l0));
  while (l < 0.9 && contrastRatio(hslToHex(h, s, l), ACCENT_SURFACE) < 4.5) l += 0.01;
  return hslToHex(h, s, l);
}

/**
 * A Spotify "Browse all" tile colour: the art's hue, saturated, dark enough for white text.
 * Without art (or with near-grey art, which has no real hue), a hue picked from `seed` so
 * each genre keeps its own colour.
 */
export function tileColor(rgb: RGB | null, seed: string): string {
  let h: number;
  let s = 0.6;
  const [h0, s0] = rgb ? rgbToHsl(rgb) : [0, 0];
  if (rgb && s0 >= 0.15) {
    h = h0;
    s = Math.max(s0, 0.6);
  } else {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    h = Math.abs(hash) % 360;
  }
  // Bright hues (yellow, green, cyan) need a darker tile than blue for white text to read (4.5:1).
  let l = 0.42;
  while (l > 0.12 && contrastRatio(hslToHex(h, s, l), '#ffffff') < 4.5) l -= 0.01;
  return hslToHex(h, s, l);
}
