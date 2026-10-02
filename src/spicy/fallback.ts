// Font fallback for the Spicy renderer. Skia draws text with exactly the font it's given, so
// lyrics in a script the lyrics font doesn't have (Japanese, Chinese, Korean, Thai…) came out
// as empty boxes. Text is split into runs here: each character uses the lyrics font if it has
// it, else the first iOS system font that does. Normal text (Regular mode, the app) never had
// this problem: iOS falls back on its own there.
import { Skia, type SkFont } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

/** A piece of text drawn with one font, `dx` from the start of the whole text. */
export interface TextRun {
  text: string;
  font: SkFont;
  dx: number;
}

export interface Shaped {
  runs: TextRun[];
  w: number;
}

/** iOS system fonts to try, in order, for characters the lyrics font doesn't have. */
const FAMILIES = [
  'Hiragino Sans', // Japanese
  'PingFang SC', // Chinese (simplified)
  'PingFang TC', // Chinese (traditional)
  'Apple SD Gothic Neo', // Korean
  'Thonburi', // Thai
  'Kohinoor Devanagari', // Hindi and other Devanagari
  'Geeza Pro', // Arabic
  'Arial Hebrew', // Hebrew
  'Apple Symbols',
  'Apple Color Emoji',
];

/** Zero-width and combining characters stay with the character before them. */
const ATTACHES = /[\u0300-\u036f\u200b-\u200f\u2060\ufe00-\ufe0f\ufeff\u{e0100}-\u{e01ef}]/u;

/** Font metrics and glyph lookup: SkFont, or a stand-in in tests. */
export interface GlyphFont {
  getGlyphIDs(text: string): number[];
  getGlyphWidths(ids: number[]): number[];
  getSize(): number;
}

let systemTypefaces: ReturnType<ReturnType<typeof Skia.FontMgr.System>['matchFamilyStyle']>[] | null = null;

function typefaces() {
  if (systemTypefaces) return systemTypefaces;
  systemTypefaces = [];
  if (Platform.OS !== 'ios') return systemTypefaces;
  try {
    const mgr = Skia.FontMgr.System();
    for (const family of FAMILIES) {
      try {
        const tf = mgr.matchFamilyStyle(family, { weight: 700 });
        if (tf) systemTypefaces.push(tf);
      } catch {
        // Not on this iOS version: skip it.
      }
    }
  } catch {
    // No system font manager: no fallback.
  }
  return systemTypefaces;
}

const fallbacks = new WeakMap<SkFont, SkFont[]>();

/** The system fallback fonts at the same size as `font` (made once per font). */
function fallbacksFor(font: SkFont): SkFont[] {
  let list = fallbacks.get(font);
  if (!list) {
    const size = font.getSize();
    list = typefaces().map((tf) => Skia.Font(tf, size));
    fallbacks.set(font, list);
  }
  return list;
}

function width(font: GlyphFont, text: string, ids = font.getGlyphIDs(text)): number {
  let w = 0;
  for (const x of font.getGlyphWidths(ids)) w += x;
  return w;
}

/**
 * Split `text` into runs by which font has each character, and measure it. When the lyrics
 * font has everything (the usual case) it's one run with that font.
 */
export function shapeText(font: SkFont, text: string): Shaped {
  return splitRuns(font, text, fallbacksFor);
}

/** shapeText with the fallback fonts passed in (tests use stand-in fonts). */
export function splitRuns<F extends GlyphFont>(font: F, text: string, fallbacksOf: (f: F) => F[]) {
  const runs: { text: string; font: F; dx: number }[] = [];
  if (!text) return { runs, w: 0 };
  const ids = font.getGlyphIDs(text);
  if (!ids.includes(0)) {
    runs.push({ text, font, dx: 0 });
    return { runs, w: width(font, text, ids) };
  }
  const others = fallbacksOf(font);
  // Skia gives one glyph id per code point, so ids[i] is the i-th character's.
  Array.from(text).forEach((ch, i) => {
    const last = runs[runs.length - 1];
    const f =
      last && ATTACHES.test(ch)
        ? last.font
        : ids[i] !== 0 || /\s/.test(ch)
          ? font
          : (others.find((o) => o.getGlyphIDs(ch)[0] !== 0) ?? font);
    if (last && last.font === f) last.text += ch;
    else runs.push({ text: ch, font: f, dx: 0 });
  });
  let w = 0;
  for (const run of runs) {
    run.dx = w;
    w += width(run.font, run.text);
  }
  return { runs, w };
}
