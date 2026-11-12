// Rakki's own icons (2.0): one hand-drawn set on a 24 point grid with round strokes, the same on
// the phone and the desktop. They're a font (assets/fonts/RakkiIcons.ttf, built from
// scripts/icons/icons.py), named like the Ionicons they replace, so screens keep asking for
// <Ionicons name="shuffle" /> and get Rakki's drawing. A name the set doesn't have yet falls back
// to the Ionicons glyph, so nothing ever shows blank.
import { Ionicons as Fallback } from '@expo/vector-icons';
import createIconSet from '@expo/vector-icons/createIconSet';
import type { ComponentProps } from 'react';

import glyphs from '@/ui/iconGlyphs.json';

const Drawn = createIconSet(glyphs as Record<keyof typeof glyphs, number>, 'RakkiIcons', require('../../assets/fonts/RakkiIcons.ttf'));

type Props = ComponentProps<typeof Fallback>;

function Icon(props: Props) {
  if (props.name in glyphs) return <Drawn {...props} name={props.name as keyof typeof glyphs} />;
  return <Fallback {...props} />;
}

/** The icon font, for useFonts at launch (app/_layout.tsx), so no icon ever pops in. */
export const ICON_FONT = Drawn.font;

/** Same name and props as @expo/vector-icons' Ionicons (glyphMap included, for typing names). */
export const Ionicons = Object.assign(Icon, { glyphMap: Fallback.glyphMap });
