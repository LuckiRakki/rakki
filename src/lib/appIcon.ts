// The Home Screen icon: one of 17 colour palettes in three styles (Liquid Glass, Depth, Flat),
// or one of the two extra designs. Every icon is built into the app (iOS can only switch to
// icons that ship inside it; see app.json and plugins/withGlassAlternateIcons.js). Builds
// before 0.2.0 can't switch at all, so everything is guarded and loaded lazily.
import { requireOptionalNativeModule } from 'expo';
import type { ImageSourcePropType } from 'react-native';
import { Platform } from 'react-native';

export type IconStyle = 'Glass' | 'Depth' | 'Flat';

export const ICON_STYLES: { key: IconStyle; label: string }[] = [
  { key: 'Glass', label: 'Liquid Glass' },
  { key: 'Depth', label: 'Depth' },
  { key: 'Flat', label: 'Flat' },
];

/** The palettes, in the order they're shown. The names match the icons in the build. */
export const PALETTES = [
  'Classic',
  'Sage',
  'Sky',
  'Lemon',
  'Sand',
  'Lavender',
  'Coral',
  'Mint',
  'Blush',
  'Aqua',
  'Peach',
  'Periwinkle',
  'Mocha',
  'Cyan',
  'Lime',
  'Pink',
  'Midnight',
] as const;
export type Palette = (typeof PALETTES)[number];

/** The two designs that aren't the neko. */
export const EXTRA_ICONS: { name: string; label: string; preview: ImageSourcePropType }[] = [
  { name: 'NekoPlayer', label: 'Neko player', preview: require('../../assets/icons/preview-neko-player.png') },
  { name: 'LyricLines', label: 'Lyric lines', preview: require('../../assets/icons/preview-lyric-lines.png') },
];

const PREVIEWS: Record<string, ImageSourcePropType> = {
  'Classic-Glass': require('../../assets/icons/previews/Classic-Glass.png'),
  'Classic-Depth': require('../../assets/icons/previews/Classic-Depth.png'),
  'Classic-Flat': require('../../assets/icons/previews/Classic-Flat.png'),
  'Sage-Glass': require('../../assets/icons/previews/Sage-Glass.png'),
  'Sage-Depth': require('../../assets/icons/previews/Sage-Depth.png'),
  'Sage-Flat': require('../../assets/icons/previews/Sage-Flat.png'),
  'Sky-Glass': require('../../assets/icons/previews/Sky-Glass.png'),
  'Sky-Depth': require('../../assets/icons/previews/Sky-Depth.png'),
  'Sky-Flat': require('../../assets/icons/previews/Sky-Flat.png'),
  'Lemon-Glass': require('../../assets/icons/previews/Lemon-Glass.png'),
  'Lemon-Depth': require('../../assets/icons/previews/Lemon-Depth.png'),
  'Lemon-Flat': require('../../assets/icons/previews/Lemon-Flat.png'),
  'Sand-Glass': require('../../assets/icons/previews/Sand-Glass.png'),
  'Sand-Depth': require('../../assets/icons/previews/Sand-Depth.png'),
  'Sand-Flat': require('../../assets/icons/previews/Sand-Flat.png'),
  'Lavender-Glass': require('../../assets/icons/previews/Lavender-Glass.png'),
  'Lavender-Depth': require('../../assets/icons/previews/Lavender-Depth.png'),
  'Lavender-Flat': require('../../assets/icons/previews/Lavender-Flat.png'),
  'Coral-Glass': require('../../assets/icons/previews/Coral-Glass.png'),
  'Coral-Depth': require('../../assets/icons/previews/Coral-Depth.png'),
  'Coral-Flat': require('../../assets/icons/previews/Coral-Flat.png'),
  'Mint-Glass': require('../../assets/icons/previews/Mint-Glass.png'),
  'Mint-Depth': require('../../assets/icons/previews/Mint-Depth.png'),
  'Mint-Flat': require('../../assets/icons/previews/Mint-Flat.png'),
  'Blush-Glass': require('../../assets/icons/previews/Blush-Glass.png'),
  'Blush-Depth': require('../../assets/icons/previews/Blush-Depth.png'),
  'Blush-Flat': require('../../assets/icons/previews/Blush-Flat.png'),
  'Aqua-Glass': require('../../assets/icons/previews/Aqua-Glass.png'),
  'Aqua-Depth': require('../../assets/icons/previews/Aqua-Depth.png'),
  'Aqua-Flat': require('../../assets/icons/previews/Aqua-Flat.png'),
  'Peach-Glass': require('../../assets/icons/previews/Peach-Glass.png'),
  'Peach-Depth': require('../../assets/icons/previews/Peach-Depth.png'),
  'Peach-Flat': require('../../assets/icons/previews/Peach-Flat.png'),
  'Periwinkle-Glass': require('../../assets/icons/previews/Periwinkle-Glass.png'),
  'Periwinkle-Depth': require('../../assets/icons/previews/Periwinkle-Depth.png'),
  'Periwinkle-Flat': require('../../assets/icons/previews/Periwinkle-Flat.png'),
  'Mocha-Glass': require('../../assets/icons/previews/Mocha-Glass.png'),
  'Mocha-Depth': require('../../assets/icons/previews/Mocha-Depth.png'),
  'Mocha-Flat': require('../../assets/icons/previews/Mocha-Flat.png'),
  'Cyan-Glass': require('../../assets/icons/previews/Cyan-Glass.png'),
  'Cyan-Depth': require('../../assets/icons/previews/Cyan-Depth.png'),
  'Cyan-Flat': require('../../assets/icons/previews/Cyan-Flat.png'),
  'Lime-Glass': require('../../assets/icons/previews/Lime-Glass.png'),
  'Lime-Depth': require('../../assets/icons/previews/Lime-Depth.png'),
  'Lime-Flat': require('../../assets/icons/previews/Lime-Flat.png'),
  'Pink-Glass': require('../../assets/icons/previews/Pink-Glass.png'),
  'Pink-Depth': require('../../assets/icons/previews/Pink-Depth.png'),
  'Pink-Flat': require('../../assets/icons/previews/Pink-Flat.png'),
  'Midnight-Glass': require('../../assets/icons/previews/Midnight-Glass.png'),
  'Midnight-Depth': require('../../assets/icons/previews/Midnight-Depth.png'),
  'Midnight-Flat': require('../../assets/icons/previews/Midnight-Flat.png'),
};

export function iconPreview(palette: Palette, style: IconStyle): ImageSourcePropType {
  return PREVIEWS[`${palette}-${style}`];
}

/** The icon's name in the build (`null`: the main icon, Classic in Liquid Glass). */
export function iconName(palette: Palette, style: IconStyle): string | null {
  return palette === 'Classic' && style === 'Glass' ? null : `${palette}${style}`;
}

/** What an icon name is: a palette in a style, or one of the extras. */
export function parseIconName(name: string | null): { palette: Palette; style: IconStyle } | { extra: string } {
  if (!name) return { palette: 'Classic', style: 'Glass' };
  if (EXTRA_ICONS.some((e) => e.name === name)) return { extra: name };
  const m = /^(.+?)(Glass|Depth|Flat)$/.exec(name);
  const palette = PALETTES.find((p) => p === m?.[1]);
  return palette && m ? { palette, style: m[2] as IconStyle } : { palette: 'Classic', style: 'Glass' };
}

const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<{ supportsAlternateIcons: boolean }>('ExpoAlternateAppIcons')
    : null;

/** Whether this build and device can switch icons. */
export const appIconsAvailable = !!native?.supportsAlternateIcons;

export async function getAppIcon(): Promise<string | null> {
  if (!appIconsAvailable) return null;
  const { getAppIconName } = await import('expo-alternate-app-icons');
  return getAppIconName() ?? null;
}

/** Switch the Home Screen icon. iOS confirms the change with its own alert. */
export async function setAppIcon(name: string | null): Promise<void> {
  if (!appIconsAvailable) return;
  const { setAlternateAppIcon } = await import('expo-alternate-app-icons');
  await setAlternateAppIcon(name as never);
}
