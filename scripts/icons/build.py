#!/usr/bin/env python3
"""Builds Rakki's icon font from scripts/icons/icons.py.

Writes RakkiIcons.ttf and its glyph map (icon name -> code point) for both apps:
  assets/fonts/RakkiIcons.ttf + src/ui/iconGlyphs.json            (phone, via @expo/vector-icons)
  desktop/src/assets/RakkiIcons.ttf + desktop/src/ui/iconGlyphs.json (desktop, ui/icons.tsx)

Strokes are turned into outlines (round caps and joins), overlaps merged and cut-outs removed,
so the font draws exactly what the 24 point drawing shows. Needs: pip install fonttools skia-pathops
Run from the repo root: python3 scripts/icons/build.py
"""
import json
import os
import shutil
import sys
import xml.etree.ElementTree as ET

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path

sys.path.insert(0, os.path.dirname(__file__))
from icons import ICONS  # noqa: E402

UPM, ASCENT, DESCENT = 512, 448, -64          # Ionicons' metrics, so sizes and baselines match
SCALE = UPM / 24
FIRST = 0xE000                                 # Private Use Area


def circle_d(cx, cy, r):
    return f'M{cx - r} {cy}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0z'


def rect_d(x, y, w, h, rx):
    if not rx:
        return f'M{x} {y}h{w}v{h}h{-w}z'
    return (f'M{x + rx} {y}h{w - 2 * rx}a{rx} {rx} 0 0 1 {rx} {rx}v{h - 2 * rx}a{rx} {rx} 0 0 1 {-rx} {rx}'
            f'h{-(w - 2 * rx)}a{rx} {rx} 0 0 1 {-rx} {-rx}v{-(h - 2 * rx)}a{rx} {rx} 0 0 1 {rx} {-rx}z')


def element_d(el):
    a = el.attrib
    f = lambda k, d=0: float(a.get(k, d))
    if el.tag == 'path':
        return a['d']
    if el.tag == 'circle':
        return circle_d(f('cx'), f('cy'), f('r'))
    if el.tag == 'rect':
        return rect_d(f('x'), f('y'), f('width'), f('height'), f('rx'))
    raise ValueError(f'unsupported element {el.tag}')


def to_path(d):
    p = pathops.Path()
    parse_path(d, p.getPen())
    return p


def outline(markup):
    builder = pathops.OpBuilder(fix_winding=True, keep_starting_points=False)
    cuts = []
    for el in ET.fromstring(f'<g>{markup}</g>'):
        d = element_d(el)
        parts = []
        if el.get('fill') == 'currentColor':
            parts.append(to_path(d))
        if el.get('stroke') != 'none':
            s = to_path(d)
            s.stroke(float(el.get('stroke-width', 2)), pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4)
            s.convertConicsToQuads()
            s.simplify(fix_winding=True, keep_starting_points=False)
            parts.append(s)
        for p in parts:
            if el.get('data-cut') == '1':
                cuts.append(p)
            else:
                builder.add(p, pathops.PathOp.UNION)
    for c in cuts:
        builder.add(c, pathops.PathOp.DIFFERENCE)
    return builder.resolve()


def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    names = sorted(ICONS)
    glyph_names = ['.notdef'] + [f'i{n:03d}' for n in range(len(names))]
    glyphs, cmap, glyph_map = {}, {}, {}
    empty = TTGlyphPen(None)
    glyphs['.notdef'] = empty.glyph()
    for n, name in enumerate(names):
        gname = glyph_names[n + 1]
        pen = TTGlyphPen(None)
        # 24 point grid -> font units, y up, sitting between the descent and the ascent.
        outline(ICONS[name]).draw(TransformPen(Cu2QuPen(pen, max_err=0.5, reverse_direction=True), (SCALE, 0, 0, -SCALE, 0, ASCENT)))
        glyphs[gname] = pen.glyph()
        cmap[FIRST + n] = gname
        glyph_map[name] = FIRST + n

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(glyph_names)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    glyf = fb.font['glyf']
    fb.setupHorizontalMetrics({g: (UPM, getattr(glyf[g], 'xMin', 0)) for g in glyph_names})
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    fb.setupNameTable({'familyName': 'RakkiIcons', 'styleName': 'Regular', 'psName': 'RakkiIcons-Regular'})
    fb.setupOS2(sTypoAscender=ASCENT, sTypoDescender=DESCENT, sTypoLineGap=0, usWinAscent=ASCENT, usWinDescent=-DESCENT)
    fb.setupPost()

    phone_font = os.path.join(root, 'assets', 'fonts', 'RakkiIcons.ttf')
    os.makedirs(os.path.dirname(phone_font), exist_ok=True)
    fb.save(phone_font)
    shutil.copyfile(phone_font, os.path.join(root, 'desktop', 'src', 'assets', 'RakkiIcons.ttf'))
    for out in (os.path.join(root, 'src', 'ui', 'iconGlyphs.json'), os.path.join(root, 'desktop', 'src', 'ui', 'iconGlyphs.json')):
        with open(out, 'w') as f:
            json.dump(glyph_map, f, indent=2)
            f.write('\n')
    print(f'{len(names)} icons -> {phone_font}')


if __name__ == '__main__':
    main()
