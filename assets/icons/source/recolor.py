"""Recolor the layered Rakki icon (Rakki Icon.psd) from two colors.

The icon has two color roles; every element follows one of them:
  background  Background Color, IPod > headphones accent, Track pad and Screen > Screen, Trackpad
  cat         Cat, Track pad and Screen > Trackpad buttons
  backdrop    Cat Backdrop (only in the backdrop version): worked out from the background,
              same hue, darker and more muted, like the original lavender (200,185,240) ->
              (95,86,145); pass a fourth color to choose it yourself
The iPod body keeps its own (white) pixels.

    python recolor.py "Rakki Icon.psd" "#C8B9F0" "#F3F1FE" out/lavender [backdrop]
writes out/lavender.psd (layers and overlays kept, ready for Photoshop) and out/lavender.png.
Needs: pip install psd-tools
"""
import colorsys
import sys
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer

BACKGROUND = {'headphones accent', 'Screen', 'Trackpad'}
CAT = {'Cat', 'Trackpad buttons'}


def rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip('#')
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def backdrop_for(bg):
    """The Cat Backdrop color for a background: the original file's ratio (lightness x0.54,
    saturation x0.37), or a little lighter than a very dark background so it still shows."""
    h, l, sat = colorsys.rgb_to_hls(*(c / 255 for c in bg))
    l2 = l + 0.06 if l < 0.2 else l * 0.54
    return tuple(round(c * 255) for c in colorsys.hls_to_rgb(h, l2, sat * 0.37))


def set_overlay(layer, color):
    """Change the layer's Color Overlay (Photoshop's 'SoFi' effect) to `color`."""
    for key in layer.tagged_blocks.keys():
        if getattr(key, 'name', '') == 'OBJECT_BASED_EFFECTS_LAYER_INFO':
            fx = layer.tagged_blocks.get_data(key)
            clr = fx[b'SoFi'][b'Clr ']
            # Keep Photoshop's own value types (a plain float can't be written back).
            for channel, value in zip((b'Rd  ', b'Grn ', b'Bl  '), color):
                clr[channel] = type(clr[channel])(float(value))
            return
    raise ValueError(f'{layer.name!r} has no Color Overlay')


def recolor(src: str, bg_hex: str, cat_hex: str, out: str, backdrop_hex: str | None = None):
    bg, cat = rgb(bg_hex), rgb(cat_hex)
    backdrop = rgb(backdrop_hex) if backdrop_hex else backdrop_for(bg)
    psd = PSDImage.open(src)
    for layer in list(psd.descendants()):
        if layer.name in BACKGROUND:
            set_overlay(layer, bg)
        elif layer.name in CAT:
            set_overlay(layer, cat)
        elif layer.name == 'Cat Backdrop':
            set_overlay(layer, backdrop)
    # The background is a plain pixel layer: replace it with a solid one in the new color.
    old = next(l for l in psd if l.name == 'Background Color')
    solid = Image.new('RGBA', (psd.width, psd.height), bg + (255,))
    new = PixelLayer.frompil(solid, psd, 'Background Color', top=0, left=0)
    psd.insert(psd.index(old), new)
    psd.remove(old)
    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    psd.save(out_path.with_suffix('.psd'))
    render(PSDImage.open(out_path.with_suffix('.psd'))).save(out_path.with_suffix('.png'))


def overlay_color(layer):
    for key in layer.tagged_blocks.keys():
        if getattr(key, 'name', '') == 'OBJECT_BASED_EFFECTS_LAYER_INFO':
            fx = layer.tagged_blocks.get_data(key)
            if b'SoFi' in fx and fx[b'SoFi'][b'enab']:
                c = fx[b'SoFi'][b'Clr ']
                return tuple(round(float(c[k])) for k in (b'Rd  ', b'Grn ', b'Bl  '))
    return None


def render(psd) -> Image.Image:
    """A flat preview, drawing Color Overlays (psd-tools' own renderer skips them)."""
    canvas = Image.new('RGBA', (psd.width, psd.height), (0, 0, 0, 0))
    for layer in psd.descendants():
        if layer.is_group() or not layer.is_visible():
            continue
        pixels = layer.topil()
        if pixels is None:
            continue
        pixels = pixels.convert('RGBA')
        color = overlay_color(layer)
        if color:
            pixels = Image.merge('RGBA', (*Image.new('RGB', pixels.size, color).split(), pixels.split()[3]))
        canvas.alpha_composite(pixels, (layer.left, layer.top))
    return canvas


if __name__ == '__main__':
    if len(sys.argv) not in (5, 6):
        sys.exit(__doc__)
    recolor(*sys.argv[1:])
