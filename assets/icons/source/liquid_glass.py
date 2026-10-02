"""Build an iOS 26 Liquid Glass icon (an Icon Composer .icon bundle) from the layered PSD.

    python liquid_glass.py "Rakki icon (backdrop).psd" "#C8B9F0" "#F3F1FE" out/Lavender.icon [backdrop]

Each element of the PSD becomes its own layer (a white shape the icon colors with a fill), in
three glass groups, top to bottom:
  iPod      buttons (cat color), screen + trackpad and headphones accent (background color),
            the iPod and headphones (white)
  Cat       the cat (cat color)
  Backdrop  the cat's shadow (backdrop color; derived from the background if not given)
The background is the icon's fill. Dark appearance: a deep shade of the background behind
the same cat. iOS makes the Clear and Tinted looks from the shapes on its own.
Reference an .icon from app.json ("ios": {"icon": "./assets/icons/Rakki.icon"}); older iOS
versions get a flat fallback automatically.
"""
import json
import sys
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage

from recolor import backdrop_for, rgb

SIZE = 1024  # Icon Composer's canvas, in points (and our layer images, in pixels)

# PSD layer names -> the shape images in the bundle
SHAPES = {
    'buttons': ['Trackpad buttons'],
    'screen': ['Screen', 'Trackpad'],
    'accent': ['headphones accent'],
    'ipod': ['Ipod w headphones'],
    'cat': ['Cat'],
    'backdrop': ['Cat Backdrop'],
}


def export_shapes(psd_path: str) -> dict[str, Image.Image]:
    """Each element as a white shape on a transparent 1024x1024 canvas."""
    psd = PSDImage.open(psd_path)
    by_name = {l.name: l for l in psd.descendants() if not l.is_group()}
    shapes = {}
    for shape, names in SHAPES.items():
        alpha = Image.new('L', (psd.width, psd.height), 0)
        for name in names:
            layer = by_name[name]
            pixels = layer.topil().convert('RGBA')
            canvas = Image.new('L', (psd.width, psd.height), 0)
            canvas.paste(pixels.split()[3], (layer.left, layer.top))
            alpha = Image.fromarray(__import__('numpy').maximum(alpha, canvas))
        alpha = alpha.resize((SIZE, SIZE), Image.LANCZOS)
        shapes[shape] = Image.merge('RGBA', (*Image.new('RGB', (SIZE, SIZE), (255, 255, 255)).split(), alpha))
    return shapes


def p3(color) -> str:
    """An sRGB color as Icon Composer's display-p3 string."""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    def enc(c):
        c = min(1.0, max(0.0, c))
        return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

    r, g, b = (lin(c) for c in color)
    # sRGB -> Display P3, both D65
    p = (0.8225 * r + 0.1774 * g, 0.0332 * r + 0.9669 * g, 0.0171 * r + 0.0724 * g + 0.9108 * b)
    return 'display-p3:' + ','.join(f'{enc(c):.5f}' for c in p) + ',1.00000'


def shade(color, factor):
    return tuple(round(c * factor) for c in color)


def layer(name, light, dark=None):
    spec = {'image-name': f'{name}.png', 'name': name,
            'position': {'scale': 1, 'translation-in-points': [0, 0]}}
    fills = [{'value': {'solid': p3(light)}}]
    if dark is not None:
        fills.append({'appearance': 'dark', 'value': {'solid': p3(dark)}})
    spec['fill-specializations'] = fills
    return spec


def group(name, layers, *, translucency, shadow_opacity, specular=True, blur=None):
    g = {
        'name': name,
        'layers': layers,
        'lighting': 'individual',
        'specular': specular,
        'shadow': {'kind': 'neutral', 'opacity': shadow_opacity},
        'translucency': {'enabled': translucency > 0, 'value': translucency},
    }
    if blur is not None:
        g['blur-material'] = blur
    return g


def build(psd_path, bg_hex, cat_hex, out, backdrop_hex=None, shapes=None):
    bg, cat = rgb(bg_hex), rgb(cat_hex)
    backdrop = rgb(backdrop_hex) if backdrop_hex else backdrop_for(bg)
    # Dark mode: the background drops to a deep shade (the backdrop's own hue), everything
    # that follows the background follows it there too.
    dark_bg = shade(backdrop, 0.55)
    dark_backdrop = shade(backdrop, 0.3)
    white = (255, 255, 255)

    out = Path(out)
    assets = out / 'Assets'
    assets.mkdir(parents=True, exist_ok=True)
    shapes = shapes or export_shapes(psd_path)
    for name, img in shapes.items():
        img.save(assets / f'{name}.png', optimize=True)

    icon = {
        'fill-specializations': [
            {'value': {'solid': p3(bg)}},
            {'appearance': 'dark', 'value': {'solid': p3(dark_bg)}},
        ],
        'groups': [
            group('iPod', [
                layer('buttons', cat),
                layer('screen', bg, dark_bg),
                layer('accent', bg, dark_bg),
                layer('ipod', white),
            ], translucency=0, shadow_opacity=0.5),
            group('Cat', [layer('cat', cat)], translucency=0.2, shadow_opacity=0.45, blur=0.3),
            group('Backdrop', [layer('backdrop', backdrop, dark_backdrop)],
                  translucency=0.4, shadow_opacity=0, specular=False),
        ],
        'supported-platforms': {'squares': 'shared'},
    }
    (out / 'icon.json').write_text(json.dumps(icon, indent=2))
    return out


if __name__ == '__main__':
    if len(sys.argv) not in (5, 6):
        sys.exit(__doc__)
    build(*sys.argv[1:])
