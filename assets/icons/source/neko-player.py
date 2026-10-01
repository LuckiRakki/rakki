# Rakki alternative icon: a white music player with cat ears and a sleepy-happy face.
# Variants: 'straight' (cord drops off the bottom) and 'tail' (the cord curls up like her
# S-tail and ends in an earbud). Writes player-<variant>.svg.
BG = '#FF6B3D'
WHITE = '#FFFFFF'
SCREEN = '#161616'
WHEEL = '#C4C4C4'
BLUSH = '#FF6B3D'


def body(dx=0):
    """Player body and ears as one shape; ears grow out of the top corners."""
    def x(v):
        return v + dx
    d = (f'M{x(312)} 430 L{x(312)} 334 Q{x(312)} 300 {x(316)} 282 L{x(326)} 172 Q{x(330)} 150 {x(350)} 162 '
         f'L{x(474)} 250 L{x(550)} 250 L{x(674)} 162 Q{x(694)} 150 {x(698)} 172 L{x(708)} 282 Q{x(712)} 300 {x(712)} 334 '
         f'L{x(712)} 786 Q{x(712)} 870 {x(628)} 870 L{x(396)} 870 Q{x(312)} 870 {x(312)} 786 Z')
    inner = (f'<path d="M{x(334)} 252 L{x(341)} 190 L{x(438)} 252 Z" fill="{BG}" stroke="{BG}" stroke-width="8" stroke-linejoin="round"/>'
             f'<path d="M{x(690)} 252 L{x(683)} 190 L{x(586)} 252 Z" fill="{BG}" stroke="{BG}" stroke-width="8" stroke-linejoin="round"/>')
    screen = f'<rect x="{x(362)}" y="300" width="300" height="220" rx="32" fill="{SCREEN}"/>'
    face = (f'<g fill="none" stroke="{WHITE}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">'
            f'<path d="M{x(428)} 420 Q{x(451)} 392 {x(474)} 420"/><path d="M{x(550)} 420 Q{x(573)} 392 {x(596)} 420"/>'
            f'<path d="M{x(489)} 452 Q{x(500.5)} 467 {x(512)} 455 Q{x(523.5)} 467 {x(535)} 452" stroke-width="10"/></g>'
            f'<ellipse cx="{x(414)}" cy="452" rx="20" ry="11" fill="{BLUSH}" fill-opacity="0.9"/>'
            f'<ellipse cx="{x(610)}" cy="452" rx="20" ry="11" fill="{BLUSH}" fill-opacity="0.9"/>')
    wheel = (f'<circle cx="{x(512)}" cy="700" r="128" fill="{WHEEL}"/>'
             f'<circle cx="{x(512)}" cy="700" r="50" fill="{WHITE}"/>')
    return f'<path d="{d}" fill="{WHITE}"/>' + inner + screen + face + wheel


def earbud(x, y, angle):
    """An earbud lying at the end of the cord, stem pointing back along it."""
    return (f'<g transform="translate({x} {y}) rotate({angle})">'
            f'<rect x="-12" y="0" width="24" height="70" rx="12" fill="{WHITE}"/>'
            f'<circle cx="0" cy="-6" r="36" fill="{WHITE}"/></g>')


def svg(variant):
    if variant == 'straight':
        cord = f'<path d="M512 870 C512 940 536 990 552 1100" fill="none" stroke="{WHITE}" stroke-width="18" stroke-linecap="round"/>'
        art = cord + body()
    else:
        dx = -58
        cord = (f'<path d="M{512 + dx} 870 C{512 + dx} 985 650 1000 775 925 C890 855 875 715 790 645 '
                f'C715 585 735 455 835 425" fill="none" stroke="{WHITE}" stroke-width="18" stroke-linecap="round"/>')
        art = cord + body(dx) + earbud(842, 420, 72)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="{BG}"/>{art}</svg>'


for v in ('straight', 'tail'):
    open(f'player-{v}.svg', 'w', encoding='utf-8').write(svg(v))
    print('wrote', v)
