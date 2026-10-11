// The Home Screen icon: one of the built-in colour palettes in three styles (Liquid Glass,
// Depth, Flat), or one of the two extra designs. iOS can only switch to icons that ship inside
// the app (app.json and plugins/withGlassAlternateIcons.js), and every one adds to the app's
// size, so the build carries three palettes; the other 14 are images in the repo for a Home
// Screen shortcut (docs/ICONS.md, linked from the picker). Builds before 0.2.0 can't switch at
// all, so everything is guarded and loaded lazily.
import { requireOptionalNativeModule } from 'expo';
import type { ImageSourcePropType } from 'react-native';
import { Platform } from 'react-native';

export type IconStyle = 'Glass' | 'Depth' | 'Flat';

export const ICON_STYLES: { key: IconStyle; label: string }[] = [
  { key: 'Glass', label: 'Liquid Glass' },
  { key: 'Depth', label: 'Depth' },
  { key: 'Flat', label: 'Flat' },
];

/** The palettes built into the app, in the order they're shown (names match the icons in the build). */
export const PALETTES = ['Classic', 'Lavender', 'Midnight'] as const;
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
  'Lavender-Glass': require('../../assets/icons/previews/Lavender-Glass.png'),
  'Lavender-Depth': require('../../assets/icons/previews/Lavender-Depth.png'),
  'Lavender-Flat': require('../../assets/icons/previews/Lavender-Flat.png'),
  'Midnight-Glass': require('../../assets/icons/previews/Midnight-Glass.png'),
  'Midnight-Depth': require('../../assets/icons/previews/Midnight-Depth.png'),
  'Midnight-Flat': require('../../assets/icons/previews/Midnight-Flat.png'),
};

/** Every other colour, as images for a Home Screen shortcut (with how to). */
export const MORE_ICONS_URL = 'https://github.com/LuckiRakki/rakki/blob/main/docs/ICONS.md';

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
