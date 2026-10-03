"""Copy the icon palettes into the app: alternate icons for the build and previews for the picker.

    python build_app_icons.py

Reads assets/icons/variants (made by recolor.py and liquid_glass.py; kept out of git) and writes:
  assets/icons/app/Rakki.icon              the main icon: Classic, Liquid Glass
  assets/icons/app/<Palette>Glass.icon     Liquid Glass alternates (not Classic: that's the main)
  assets/icons/app/<Palette>Depth.png      flat alternates with the cat's backdrop (1024, opaque)
  assets/icons/app/<Palette>Flat.png       plain flat alternates
  assets/icons/previews/<Palette>-<Style>.png   small previews for Customize -> App icon
Palette order and names must match PALETTES in src/lib/appIcon.ts.
"""
import shutil
from pathlib import Path

from PIL import Image

PALETTES = ['Classic', 'Sage', 'Sky', 'Lemon', 'Sand', 'Lavender', 'Coral', 'Mint', 'Blush', 'Aqua',
            'Peach', 'Periwinkle', 'Mocha', 'Cyan', 'Lime', 'Pink', 'Midnight']
ICONS = Path(__file__).resolve().parent.parent
VARIANTS = ICONS / 'variants'
APP = ICONS / 'app'
PREVIEWS = ICONS / 'previews'
PREVIEW = 120


def opaque_1024(src: Path, dst: Path):
    im = Image.open(src).convert('RGBA').resize((1024, 1024), Image.LANCZOS)
    flat = Image.new('RGB', im.size, (0, 0, 0))
    flat.paste(im, mask=im.split()[3])
    flat.save(dst, optimize=True)


def preview(src: Path, dst: Path):
    Image.open(src).convert('RGBA').resize((PREVIEW, PREVIEW), Image.LANCZOS).save(dst, optimize=True)


def main():
    if APP.exists():
        shutil.rmtree(APP)
    APP.mkdir(parents=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    for name in PALETTES:
        glass = VARIANTS / 'Glass' / f'{name}.icon'
        target = APP / ('Rakki.icon' if name == 'Classic' else f'{name}Glass.icon')
        shutil.copytree(glass, target)
        # Icon Composer's previews of the glass look (with iOS's rounded corners).
        preview(VARIANTS / 'Glass' / 'previews' / f'{name}-Default.png', PREVIEWS / f'{name}-Glass.png')
        for style, folder in (('Depth', 'Backdrop'), ('Flat', 'Flat')):
            src = VARIANTS / folder / f'{name}.png'
            opaque_1024(src, APP / f'{name}{style}.png')
            preview(src, PREVIEWS / f'{name}-{style}.png')
    print('ok', len(PALETTES))


if __name__ == '__main__':
    main()
