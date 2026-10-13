// Rakki's icons: the phone app's set (Ionicons, the font it ships with), so both apps show the
// same picture for the same action. Each icon is one character of the font, coloured by the
// text around it. A few the font lacks (the sidebar, the mini player, repeat one) are drawn in
// the same outline style. Named after what they were called before (lucide), so screens read
// the same.
import type { CSSProperties } from 'react';

import './icons.css';

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
  'add': 0xf103,
  'add-circle-outline': 0xf105,
  'alert-circle-outline': 0xf114,
  'arrow-down-circle': 0xf12e,
  'arrow-down-circle-outline': 0xf12f,
  'arrow-undo-outline': 0xf143,
  'arrow-up-circle-outline': 0xf147,
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
  'home': 0xf382,
  'image-outline': 0xf38f,
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
  'swap-vertical': 0xf5b3,
  'time-outline': 0xf5de,
  'timer-outline': 0xf5e1,
  'trash-outline': 0xf5f6,
  'volume-high': 0xf613,
  'volume-low': 0xf616,
  'volume-mute': 0xf61c,
};

function Glyph({ name, size = 24, className, style, color }: IconProps & { name: string }) {
  return (
    <span className={`ico${className ? ` ${className}` : ''}`} style={{ fontSize: size, color, ...style }} aria-hidden>
      {String.fromCodePoint(GLYPH[name])}
    </span>
  );
}

const glyph = (name: string): Icon => (p) => <Glyph name={name} {...p} />;

export const Heart: Icon = (p) => <Glyph name={p.fill && p.fill !== 'none' ? 'heart' : 'heart-outline'} {...p} />;

/** Drawn in Ionicons' outline style (512 box, 32 stroke) for the ones the font doesn't have. */
function Drawn({ size = 24, className, style, color, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={`ico-svg${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      stroke="currentColor"
      strokeWidth={32}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color, ...style }}
      aria-hidden>
      {children}
    </svg>
  );
}

/** The right sidebar (Now playing view). */
export const PanelRight: Icon = (p) => (
  <Drawn {...p}>
    <rect x="48" y="80" width="416" height="352" rx="48" />
    <path d="M320 80v352" />
  </Drawn>
);

/** The mini player. */
export const PictureInPicture2: Icon = (p) => (
  <Drawn {...p}>
    <rect x="48" y="96" width="416" height="320" rx="48" />
    <rect x="264" y="248" width="152" height="120" rx="20" fill="currentColor" stroke="none" />
  </Drawn>
);

/** Repeat this song: repeat with a small 1. */
export const Repeat1: Icon = (p) => (
  <span className="ico-stack" style={{ width: p.size ?? 24, height: p.size ?? 24 }}>
    <Glyph name="repeat" {...p} />
    <b style={{ fontSize: Math.round((p.size ?? 24) * 0.42) }}>1</b>
  </span>
);

export const Alert = glyph('alert-circle-outline');
export const ArrowDownAZ = glyph('swap-vertical');
export const ArrowDownToLine = glyph('arrow-down-circle-outline');
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
export const Disc3 = glyph('disc-outline');
export const Ellipsis = glyph('ellipsis-horizontal');
export const Expand = glyph('expand');
export const ExternalLink = glyph('open-outline');
export const Eye = glyph('eye-outline');
export const EyeOff = glyph('eye-off-outline');
export const GripVertical = glyph('reorder-three');
export const HeartOff = glyph('heart-dislike-outline');
export const Home = glyph('home');
export const ImagePlus = glyph('image-outline');
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
export const Refresh = glyph('refresh');
export const Repeat = glyph('repeat');
export const Search = glyph('search');
export const Settings2 = glyph('settings-outline');
export const Shrink = glyph('contract');
export const Shuffle = glyph('shuffle');
export const SkipBack = glyph('play-skip-back');
export const SkipForward = glyph('play-skip-forward');
export const SlidersHorizontal = glyph('options-outline');
export const Smartphone = glyph('phone-portrait-outline');
export const Square = glyph('square-outline');
export const Tags = glyph('pricetags-outline');
export const Timer = glyph('timer-outline');
export const Trash2 = glyph('trash-outline');
export const Undo = glyph('arrow-undo-outline');
export const User = glyph('person-outline');
export const UserRound = glyph('person-outline');
export const Visualizer = glyph('pulse-outline');
export const Volume1 = glyph('volume-low');
export const Volume2 = glyph('volume-high');
export const VolumeX = glyph('volume-mute');
export const X = glyph('close');
