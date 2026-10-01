// The Home Screen icon: Rakki's own, or one of the alternates built into the app
// (expo-alternate-app-icons, configured in app.json). Builds before 0.2.0 don't have them, so
// everything is guarded and the native side is loaded lazily.
import { requireOptionalNativeModule } from 'expo';
import type { ImageSourcePropType } from 'react-native';
import { Platform } from 'react-native';

/** `null` is the main icon; the others match the names in app.json. */
export type AppIconName = null | 'NekoPlayer' | 'LyricLines';

export const APP_ICONS: { name: AppIconName; label: string; preview: ImageSourcePropType }[] = [
  { name: null, label: 'Rakki', preview: require('../../assets/icons/preview-rakki.png') },
  { name: 'NekoPlayer', label: 'Neko player', preview: require('../../assets/icons/preview-neko-player.png') },
  { name: 'LyricLines', label: 'Lyric lines', preview: require('../../assets/icons/preview-lyric-lines.png') },
];

const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<{ supportsAlternateIcons: boolean }>('ExpoAlternateAppIcons')
    : null;

/** Whether this build and device can switch icons. */
export const appIconsAvailable = !!native?.supportsAlternateIcons;

export async function getAppIcon(): Promise<AppIconName> {
  if (!appIconsAvailable) return null;
  const { getAppIconName } = await import('expo-alternate-app-icons');
  return (getAppIconName() as AppIconName) ?? null;
}

/** Switch the Home Screen icon. iOS confirms the change with its own alert. */
export async function setAppIcon(name: AppIconName): Promise<void> {
  if (!appIconsAvailable) return;
  const { setAlternateAppIcon } = await import('expo-alternate-app-icons');
  await setAlternateAppIcon(name);
}
