// Rakki's icons (2.0): the hand-drawn set both apps share (24 point grid, round strokes), built
// into one font by scripts/icons/build.py (assets/fonts/RakkiIcons.ttf + src/ui/iconGlyphs.json
// at the repo root), so the phone and the desktop show the same picture for the same action.
// Each icon is one character of the font, coloured by the text around it. Names are the Ionicons
// ones the screens already used; one the set doesn't have yet falls back to the Ionicons font.
// Exports keep their old (lucide) names, so screens read the same.
import type { CSSProperties } from 'react';

import glyphs from '@/ui/iconGlyphs.json';
import './icons.css';

const RAKKI = glyphs as Record<string, number>;

export interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** 'currentColor' (or any colour) asks for the filled version where there is one (the heart). */
  fill?: string;
  color?: string;
  strokeWidth?: number;
}
export type Icon = (p: IconProps) => React.JSX.Element;
/** What menus and lists take (formerly lucide's type). */
export type LucideIcon = Icon;

// Code points in Ionicons.ttf (@expo/vector-icons' glyph map), only the ones used.
const GLYPH: Record<string, number> = {
  'text-outline': 0xf5cc,
  'add': 0xf103,
  'add-circle-outline': 0xf105,
  'alert-circle-outline': 0xf114,
  'arrow-down-circle': 0xf12e,
  'arrow-back': 0xf127,
  'arrow-down': 0xf12d,
  'arrow-down-circle-outline': 0xf12f,
  'arrow-forward': 0xf133,
  'arrow-undo-outline': 0xf143,
  'arrow-up': 0xf145,
  'arrow-up-circle-outline': 0xf147,
  'backspace-outline': 0xf155,
  'checkmark': 0xf21d,
  'chevron-back': 0xf229,
  'chevron-down': 0xf232,
  'chevron-forward': 0xf23b,
  'chevron-up': 0xf241,
  'close': 0xf24a,
  'cloud-offline-outline': 0xf25b,
  'color-palette-outline': 0xf27e,
  'contract': 0xf289,
  'copy-outline': 0xf290,
  'crop-outline': 0xf296,
  'cut-outline': 0xf29c,
  'desktop-outline': 0xf29f,
  'disc-outline': 0xf2a8,
  'ellipse-outline': 0xf2cc,
  'ellipsis-horizontal': 0xf2ce,
  'expand': 0xf2e0,
  'eye-off-outline': 0xf2e8,
  'eye-outline': 0xf2ea,
  'film-outline': 0xf2ff,
  'heart': 0xf36a,
  'heart-dislike-outline': 0xf372,
  'heart-outline': 0xf377,
  'hand-left-outline': 0xf35c,
  'home': 0xf382,
  'image-outline': 0xf38f,
  'information-circle-outline': 0xf399,
  'keypad-outline': 0xf3a7,
  'laptop-outline': 0xf3ad,
  'library-outline': 0xf3b6,
  'list': 0xf3bb,
  'list-outline': 0xf3bf,
  'log-out-outline': 0xf3d1,
  'mic-outline': 0xf45e,
  'moon-outline': 0xf461,
  'musical-note': 0xf466,
  'musical-notes': 0xf469,
  'open-outline': 0xf488,
  'options-outline': 0xf48b,
  'pause': 0xf493,
  'pencil': 0xf49c,
  'person-outline': 0xf4ac,
  'phone-portrait-outline': 0xf4b5,
  'pin': 0xf4ba,
  'pin-outline': 0xf4bb,
  'play': 0xf4c6,
  'play-back': 0xf4c7,
  'play-forward': 0xf4d0,
  'play-forward-outline': 0xf4d4,
  'play-skip-back': 0xf4d8,
  'play-skip-forward': 0xf4de,
  'pricetags-outline': 0xf4ee,
  'pulse-outline': 0xf4f7,
  'radio-outline': 0xf506,
  'refresh': 0xf514,
  'remove': 0xf520,
  'reorder-three': 0xf529,
  'repeat': 0xf52f,
  'search': 0xf55f,
  'settings-outline': 0xf56c,
  'shuffle': 0xf583,
  'square-outline': 0xf593,
  'stopwatch-outline': 0xf5a5,
  'swap-vertical': 0xf5b3,
  'time-outline': 0xf5de,
  'timer-outline': 0xf5e1,
  'trash-outline': 0xf5f6,
  'volume-high': 0xf613,
  'volume-low': 0xf616,
  'volume-mute': 0xf61c,
};

function Glyph({ name, size = 24, className, style, color }: IconProps & { name: string }) {
  const own = RAKKI[name];
  return (
    <span className={`ico${own ? ' ico-r' : ''}${className ? ` ${className}` : ''}`} style={{ fontSize: size, color, ...style }} aria-hidden>
      {String.fromCodePoint(own ?? GLYPH[name])}
    </span>
  );
}

const glyph = (name: string): Icon => (p) => <Glyph name={name} {...p} />;

export const Heart: Icon = (p) => <Glyph name={p.fill && p.fill !== 'none' ? 'heart' : 'heart-outline'} {...p} />;


/** The right sidebar (Now playing view). */
export const PanelRight: Icon = (p) => <Glyph name="rakki-panel" {...p} />;

/** The mini player. */
export const PictureInPicture2: Icon = (p) => <Glyph name="rakki-mini" {...p} />;

/** Repeat this song: repeat with a small 1. */
export const Repeat1: Icon = (p) => (
  <span className="ico-stack" style={{ width: p.size ?? 24, height: p.size ?? 24 }}>
    <Glyph name="repeat" {...p} />
    <b style={{ fontSize: Math.round((p.size ?? 24) * 0.42) }}>1</b>
  </span>
);

/** Bigger video (theater, inside the window): a wide screen with arrows pushing out to the sides,
 * so it doesn't look like Full Screen's corner arrows. Drawn on the same 24 grid, round strokes. */
export const TheaterMode: Icon = ({ size = 24, className, style, color }) => (
  <svg className={`ico-svg${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M7.5 12h9M9.5 10l-2 2 2 2M14.5 10l2 2-2 2" />
  </svg>
);

/** Tagging's own icons (desktop only), drawn on the same 24 grid with round strokes. */
const svg = (paths: React.ReactNode): Icon =>
  function SvgIcon({ size = 24, className, style, color }) {
    return (
      <svg className={`ico-svg${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
        {paths}
      </svg>
    );
  };

/** Auto-Fill and look-ups: a big four-point spark and a small one. */
export const Sparkles = svg(
  <>
    <path d="M10 3.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z" />
    <path d="M18 14.5c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2 1-2.5 2.5-.3-1.5-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z" />
  </>,
);

/** Tagging: a tag with its hole. */
export const TagIcon = svg(
  <>
    <path d="M3.5 12.2V4.8c0-.7.6-1.3 1.3-1.3h7.4c.4 0 .7.1.9.4l7.4 7.4c.5.5.5 1.3 0 1.8l-7.4 7.4c-.5.5-1.3.5-1.8 0l-7.4-7.4c-.3-.2-.4-.5-.4-.9z" />
    <circle cx="8.2" cy="8.2" r="1.4" />
  </>,
);

/** The inbox (MRQ's review queue): a tray with an arrow coming in. */
export const InboxIcon = svg(
  <>
    <path d="M3.5 13.5h4.2l1.6 2.5h5.4l1.6-2.5h4.2" />
    <path d="M5.2 6.5 3.5 13.5v4.2c0 .7.6 1.3 1.3 1.3h14.4c.7 0 1.3-.6 1.3-1.3v-4.2l-1.7-7" />
    <path d="M12 3.5v7M9.5 8l2.5 2.5L14.5 8" />
  </>,
);

/** Tidy Up: a shield with a check (Big Brother keeps Jellyfin matching the files). */
export const ShieldCheck = svg(
  <>
    <path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z" />
    <path d="m8.8 12 2.2 2.2 4.2-4.4" />
  </>,
);

/** Merging two spellings into one. */
export const Merge = svg(
  <>
    <path d="M7.5 3.5v17" />
    <path d="M16.5 3.5v3.5c0 4.5-9 4.5-9 9" />
  </>,
);

/** History of edits: a clock with an arrow going back round it. */
export const HistoryIcon = svg(
  <>
    <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
    <path d="M4 4v4.5h4.5" />
    <path d="M12 8v4l2.8 2" />
  </>,
);

/** Edit Audio: a sound wave, bars of different heights. */
export const AudioWave: Icon = (p) => <Glyph name="rakki-wave" {...p} />;

export const Alert = glyph('alert-circle-outline');
export const ArrowDown = glyph('arrow-down');
export const ArrowDownAZ = glyph('swap-vertical');
export const ArrowDownToLine = glyph('arrow-down-circle-outline');
export const ArrowLeft = glyph('arrow-back');
export const ArrowRight = glyph('arrow-forward');
export const ArrowUp = glyph('arrow-up');
export const ArrowUpFromLine = glyph('arrow-up-circle-outline');
export const Blend = glyph('shuffle');
export const Check = glyph('checkmark');
export const ChevronDown = glyph('chevron-down');
export const ChevronLeft = glyph('chevron-back');
export const ChevronRight = glyph('chevron-forward');
export const ChevronUp = glyph('chevron-up');
export const Circle = glyph('ellipse-outline');
export const CircleArrowDown = glyph('arrow-down-circle');
export const Clock3 = glyph('time-outline');
export const Copy = glyph('copy-outline');
export const Crop = glyph('crop-outline');
export const Disc3 = glyph('disc-outline');
export const Backspace = glyph('backspace-outline');
export const Ellipsis = glyph('ellipsis-horizontal');
export const Expand = glyph('expand');
export const FastForward = glyph('play-forward');
export const ExternalLink = glyph('open-outline');
export const Eye = glyph('eye-outline');
export const EyeOff = glyph('eye-off-outline');
export const GripVertical = glyph('reorder-three');
export const Hand = glyph('hand-left-outline');
export const HeartOff = glyph('heart-dislike-outline');
export const Home = glyph('home');
export const ImagePlus = glyph('image-outline');
export const Info = glyph('information-circle-outline');
export const Keyboard = glyph('keypad-outline');
export const Library = glyph('library-outline');
export const ListEnd = glyph('list-outline');
export const ListMusic = glyph('list');
export const ListPlus = glyph('add-circle-outline');
export const ListStart = glyph('play-forward-outline');
export const LogOut = glyph('log-out-outline');
export const Maximize2 = glyph('expand');
export const MicVocal = glyph('mic-outline');
export const Minimize2 = glyph('contract');
export const Minus = glyph('remove');
export const Monitor = glyph('desktop-outline');
export const MonitorPlay = glyph('film-outline');
export const MonitorSpeaker = glyph('laptop-outline');
export const Moon = glyph('moon-outline');
export const MoreHorizontal = glyph('ellipsis-horizontal');
export const Music = glyph('musical-notes');
export const Music2 = glyph('musical-note');
export const Offline = glyph('cloud-offline-outline');
export const Palette = glyph('color-palette-outline');
export const Pause = glyph('pause');
export const Pencil = glyph('pencil');
export const Pin = glyph('pin');
export const PinOff = glyph('pin-outline');
export const Play = glyph('play');
export const Plus = glyph('add');
export const PlusCircle = glyph('add-circle-outline');
export const Radio = glyph('radio-outline');
export const Rewind = glyph('play-back');
export const Refresh = glyph('refresh');
export const Repeat = glyph('repeat');
export const Search = glyph('search');
export const Settings2 = glyph('settings-outline');
export const Shrink = glyph('contract');
export const Shuffle = glyph('shuffle');
export const SkipBack = glyph('play-skip-back');
export const SkipForward = glyph('play-skip-forward');
export const SlidersHorizontal = glyph('options-outline');
export const Scissors = glyph('cut-outline');
export const Smartphone = glyph('phone-portrait-outline');
export const Stats = glyph('stats-chart-outline');
export const Globe = glyph('globe-outline');
export const Server = glyph('server-outline');
export const Square = glyph('square-outline');
export const Stopwatch = glyph('stopwatch-outline');
export const Tags = glyph('pricetags-outline');
export const Timer = glyph('timer-outline');
export const Trash2 = glyph('trash-outline');
export const Undo = glyph('arrow-undo-outline');
export const TextSize = glyph('text-outline');
export const User = glyph('person-outline');
export const UserRound = glyph('person-outline');
export const Visualizer = glyph('pulse-outline');
export const Volume1 = glyph('volume-low');
export const Volume2 = glyph('volume-high');
export const VolumeX = glyph('volume-mute');
export const X = glyph('close');
