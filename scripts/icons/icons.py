# Rakki's icons (2.0): one hand-drawn set for the phone and the desktop, on a 24 point grid with
# round 2 point strokes. Each entry is SVG markup. Elements are stroked by default; an element
# with fill="currentColor" is filled too (stroke="none" for fill only), and data-cut="1" cuts the
# element out of the rest (the knocked-out mark in a solid circle). "sw" changes the stroke width.
#
# Keys are the Ionicons names both apps already ask for, so a screen keeps saying
# <Ionicons name="shuffle" /> and gets Rakki's own drawing. Build with scripts/icons/build.py.
import math


def _gear():
    """A gear: eight rounded teeth around a hole."""
    pts = []
    for k in range(8):
        c = math.radians(k * 45)
        for a, r in ((-15, 6.6), (-9, 9.2), (9, 9.2), (15, 6.6)):
            t = c + math.radians(a)
            pts.append((12 + r * math.cos(t), 12 + r * math.sin(t)))
    d = 'M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in pts) + 'Z'
    return f'<path d="{d}"/><circle cx="12" cy="12" r="2.8"/>'


HEART = 'M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z'
CLOUD = 'M7 18.5h-.5a4 4 0 0 1-.6-7.96A6 6 0 0 1 17.6 9a4.5 4.5 0 0 1 .4 9z'
EYE = 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'
TAG = 'M3.5 11.6V4.5a1 1 0 0 1 1-1h7.1l8.4 8.4a1.5 1.5 0 0 1 0 2.1l-6.5 6.5a1.5 1.5 0 0 1-2.1 0z'
HOME = 'M4 10.2 12 4l8 6.2V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-5v6h-4A1.5 1.5 0 0 1 4 19z'
PIN = '<path d="M9 3.5h6l-1 6.5 3.2 3.2V14H6.8v-.8L10 10z"/><path d="M12 14v6.5"/>'
SPEAKER = '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/>'
MIC = 'M9 6.5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z'
SKIP_BACK = '<rect x="5.5" y="5.5" width="2.4" height="13" rx="1" fill="currentColor" stroke="none"/><path d="M19.5 6.6v10.8a.9.9 0 0 1-1.4.8L10.2 12.8a.9.9 0 0 1 0-1.6l7.9-5.4a.9.9 0 0 1 1.4.8z" fill="currentColor" stroke="none"/>'
SKIP_FWD = '<rect x="16.1" y="5.5" width="2.4" height="13" rx="1" fill="currentColor" stroke="none"/><path d="M4.5 6.6v10.8a.9.9 0 0 0 1.4.8l7.9-5.4a.9.9 0 0 0 0-1.6L5.9 5.8a.9.9 0 0 0-1.4.8z" fill="currentColor" stroke="none"/>'
FWD = 'M3.5 6.6v10.8a.9.9 0 0 0 1.4.7l6.8-5.4a.9.9 0 0 0 0-1.4L4.9 5.9a.9.9 0 0 0-1.4.7zM12.5 6.6v10.8a.9.9 0 0 0 1.4.7l6.8-5.4a.9.9 0 0 0 0-1.4l-6.8-5.4a.9.9 0 0 0-1.4.7z'
BACK = 'M11.5 6.6v10.8a.9.9 0 0 1-1.4.7l-6.8-5.4a.9.9 0 0 1 0-1.4l6.8-5.4a.9.9 0 0 1 1.4.7zM20.5 6.6v10.8a.9.9 0 0 1-1.4.7l-6.8-5.4a.9.9 0 0 1 0-1.4l6.8-5.4a.9.9 0 0 1 1.4.7z'
CIRCLE = '<circle cx="12" cy="12" r="8.5"/>'
SOLID = '<circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none"/>'
GRID = ('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"{f}/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"{f}/>'
        '<rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"{f}/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"{f}/>')
SLASH = '<path d="M4 4l16 16"/>'

ICONS = {
    # Playback
    'play': '<path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10-6.4a1 1 0 0 0 0-1.7l-10-6.4A1 1 0 0 0 8 5.6z" fill="currentColor" stroke="none"/>',
    'pause': '<rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
    'stop': '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
    'play-skip-back': SKIP_BACK,
    'play-skip-forward': SKIP_FWD,
    'play-back': f'<path d="{BACK}" fill="currentColor" stroke="none"/>',
    'play-forward': f'<path d="{FWD}" fill="currentColor" stroke="none"/>',
    'play-forward-outline': f'<path d="{FWD}"/>',
    'play-circle': CIRCLE + '<path d="M10.2 8.8v6.4l5.2-3.2z" fill="currentColor"/>',
    'play-circle-outline': CIRCLE + '<path d="M10.2 8.8v6.4l5.2-3.2z"/>',
    'shuffle': '<path d="M3 7h3c4.5 0 6.5 10 11 10h4M3 17h3c1.5 0 2.7-1.1 3.7-2.7M14.3 9.7C15.3 8 16.5 7 18 7h3M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5"/>',
    'repeat': '<path d="M17 3l3 3-3 3M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4"/>',
    'volume-high': SPEAKER + '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11"/>',
    'volume-high-outline': SPEAKER + '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11"/>',
    'volume-low': SPEAKER + '<path d="M15.5 9a4.2 4.2 0 0 1 0 6"/>',
    'volume-mute': SPEAKER + '<path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    'musical-notes': '<path d="M9 17.5V5.5l10-2.2v12"/><circle cx="6.6" cy="17.5" r="2.4"/><circle cx="16.6" cy="15.3" r="2.4"/>',
    'musical-note': '<path d="M10.5 17.5V4l7 2.6"/><circle cx="8" cy="17.5" r="2.5"/>',
    'mic': f'<path d="{MIC}" fill="currentColor"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
    'mic-outline': '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
    'radio': '<circle cx="12" cy="12" r="2"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',
    'radio-outline': '<circle cx="12" cy="12" r="2"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',
    'disc-outline': CIRCLE + '<circle cx="12" cy="12" r="2.2"/>',
    'albums': '<rect x="4" y="8" width="12" height="12" rx="2" fill="currentColor"/><path d="M8 4.5h10a2 2 0 0 1 2 2V16"/>',
    'albums-outline': '<rect x="4" y="8" width="12" height="12" rx="2"/><path d="M8 4.5h10a2 2 0 0 1 2 2V16"/>',
    'film-outline': '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 5v14M16.5 5v14M3.5 12h4M16.5 12h4"/>',
    'pulse-outline': '<path d="M3.5 12h4l2.5-6 4 12 2.5-6h4"/>',
    'timer-outline': '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5M9.5 3h5"/>',
    'stopwatch-outline': '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.2 1.5M10 3h4M12 3v2.5"/>',
    'time-outline': CIRCLE + '<path d="M12 7.5V12l3 2"/>',
    'moon': '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" fill="currentColor"/>',
    'moon-outline': '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    # Like
    'heart': f'<path d="{HEART}" fill="currentColor"/>',
    'heart-outline': f'<path d="{HEART}"/>',
    'heart-dislike-outline': f'<path d="{HEART}"/>' + SLASH,
    # Navigation
    'home': f'<path d="{HOME}" fill="currentColor"/>',
    'home-outline': f'<path d="{HOME}"/>',
    'search': '<circle cx="10.8" cy="10.8" r="6.3" stroke-width="2.6"/><path d="M15.3 15.3 20 20" stroke-width="2.6"/>',
    'search-outline': '<circle cx="10.8" cy="10.8" r="6.3" stroke-width="2.2"/><path d="M15.3 15.3 20 20" stroke-width="2.2"/>',
    'library': '<path d="M5 4v16M10 4v16M14.5 4.6l4.8 15" stroke-width="2.6"/>',
    'library-outline': '<path d="M5 4v16M10 4v16M14.5 4.6l4.8 15" stroke-width="2.2"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6" stroke-width="2.2"/>',
    'chevron-up': '<path d="M6 15l6-6 6 6" stroke-width="2.2"/>',
    'chevron-back': '<path d="M15 5l-7 7 7 7" stroke-width="2.2"/>',
    'chevron-forward': '<path d="M9 5l7 7-7 7" stroke-width="2.2"/>',
    'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
    'arrow-back': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    'arrow-forward': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'arrow-undo-outline': '<path d="M9 5 4.5 9.5 9 14M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>',
    'arrow-down-circle': SOLID + '<path d="M12 7.5v8.5M8.5 12.5 12 16l3.5-3.5" data-cut="1"/>',
    'arrow-down-circle-outline': CIRCLE + '<path d="M12 7.5v8.5M8.5 12.5 12 16l3.5-3.5"/>',
    'arrow-up-circle-outline': CIRCLE + '<path d="M12 16.5V8M8.5 11.5 12 8l3.5 3.5"/>',
    'download-outline': '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
    'cloud-download-outline': f'<path d="{CLOUD}"/><path d="M12 11.5v8M9 16.5l3 3 3-3"/>',
    'cloud-offline-outline': f'<path d="{CLOUD}"/>' + SLASH,
    'open-outline': '<path d="M13 4.5h6.5V11M19.5 4.5 11 13M10 5.5H6.5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V14"/>',
    'share-outline': '<path d="M12 15V3M8 7l4-4 4 4M5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12"/>',
    'send': '<path d="M20.5 3.5 10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4z"/>',
    'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    # Actions
    'add': '<path d="M12 5v14M5 12h14" stroke-width="2.2"/>',
    'remove': '<path d="M5 12h14" stroke-width="2.2"/>',
    'add-circle-outline': CIRCLE + '<path d="M12 8v8M8 12h8"/>',
    'remove-circle-outline': CIRCLE + '<path d="M8 12h8"/>',
    'remove-circle': SOLID + '<path d="M8 12h8" data-cut="1"/>',
    'checkmark': '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="2.4"/>',
    'checkmark-circle': SOLID + '<path d="M7.8 12.3l2.9 2.9 5.5-5.6" stroke-width="2.2" data-cut="1"/>',
    'close': '<path d="M6 6l12 12M18 6 6 18"/>',
    'close-circle': SOLID + '<path d="M9 9l6 6M15 9l-6 6" data-cut="1"/>',
    'ellipsis-horizontal': '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
    'ellipse-outline': CIRCLE,
    'alert-circle': SOLID + '<path d="M12 7.5v5.5" data-cut="1"/><circle cx="12" cy="16.3" r="1.2" fill="currentColor" stroke="none" data-cut="1"/>',
    'alert-circle-outline': CIRCLE + '<path d="M12 7.5v5.5"/><circle cx="12" cy="16.3" r="1.1" fill="currentColor" stroke="none"/>',
    'information-circle-outline': CIRCLE + '<path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/>',
    'trash-outline': '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5A1.5 1.5 0 0 0 9 21h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7M10 11v6M14 11v6"/>',
    'pencil': '<path d="M15.5 4.5l4 4L8.5 19.5h-4v-4zM13 7l4 4"/>',
    'create-outline': '<path d="M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13M17 3.5l3.5 3.5-8 8H9v-3.5z"/>',
    'copy-outline': '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
    'crop-outline': '<path d="M7 3.5V15a2 2 0 0 0 2 2h11.5M3.5 7H15a2 2 0 0 1 2 2v11.5"/>',
    'cut-outline': '<circle cx="6.5" cy="17.5" r="2.8"/><circle cx="17.5" cy="17.5" r="2.8"/><path d="M8.5 15.5 18 4M15.5 15.5 6 4"/>',
    'backspace-outline': '<path d="M8.5 5H19a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H8.5L3 12zM11.5 9.5l5 5M16.5 9.5l-5 5"/>',
    'refresh': '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5V9H15"/>',
    'swap-vertical': '<path d="M4 7h16M7 12h10M10 17h4" stroke-width="2.2"/>',
    'swap-horizontal': '<path d="M4 8h15M15.5 4.5 19 8l-3.5 3.5M20 16H5M8.5 12.5 5 16l3.5 3.5"/>',
    'reorder-three': '<path d="M5 8h14M5 12h14M5 16h14"/>',
    'list': '<path d="M4 6h16M4 12h16M4 18h10"/>',
    'list-outline': '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none"/>',
    'grid': GRID.format(f=' fill="currentColor"'),
    'grid-outline': GRID.format(f=''),
    'expand': '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>',
    'contract': '<path d="M20 4l-6 6M14 5.5V10h4.5M4 20l6-6M10 18.5V14H5.5"/>',
    'eye-outline': f'<path d="{EYE}"/><circle cx="12" cy="12" r="3"/>',
    'eye-off-outline': f'<path d="{EYE}"/><circle cx="12" cy="12" r="3"/>' + SLASH,
    'pin': PIN,
    'pin-outline': PIN + SLASH,
    'pricetag': f'<path d="{TAG}" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" data-cut="1"/>',
    'pricetags-outline': f'<path d="{TAG}"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/>',
    'image-outline': '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 15.5 16 11 6 19"/>',
    'camera': '<path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.8" r="3.3"/>',
    'hand-left-outline': '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4.5a1.5 1.5 0 0 1 3 0v7M14 11.5V6a1.5 1.5 0 0 1 3 0v8a6.5 6.5 0 0 1-6.5 6.5h-.6a5.5 5.5 0 0 1-4.4-2.2L3.6 15a1.5 1.5 0 0 1 2.3-1.9L8 15.5"/>',
    'text-outline': '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
    # People, places, devices
    'person': '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
    'person-outline': '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
    'phone-portrait-outline': '<rect x="6.5" y="3" width="11" height="18" rx="2.2"/><path d="M11 17.5h2"/>',
    'laptop-outline': '<rect x="6" y="3" width="12" height="18" rx="2.5"/><circle cx="12" cy="14.5" r="3"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/>',
    'desktop-outline': '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M9 20h6M12 16v4"/>',
    'tv-outline': '<rect x="3.5" y="5" width="17" height="11.5" rx="2"/><path d="M8.5 20h7"/>',
    'globe-outline': CIRCLE + '<path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z"/>',
    'server-outline': '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    'keypad-outline': '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>',
    'log-out-outline': '<path d="M14 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h7M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5"/>',
    'color-palette-outline': '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.9 0-1.4-1.2-1.7-1.2-3 0-1 .8-1.6 1.8-1.6H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.6 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="7.3" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7.3" r="1.2" fill="currentColor" stroke="none"/>',
    'options-outline': '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    'settings-outline': _gear(),
    'stats-chart-outline': '<path d="M6 20v-6M12 20V5M18 20v-9" stroke-width="2.4"/>',
    'square-outline': '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/>',
    # Desktop's own (the side panel, the mini player, the sound wave)
    'rakki-panel': '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M14 4.5v15"/>',
    'rakki-mini': '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><rect x="11.5" y="12" width="6" height="4.5" rx="1" fill="currentColor"/>',
    'rakki-wave': '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" stroke-width="2.2"/>',
}
