// Over-the-air updates (EAS Update, channel "production"). Only the release build has the
// native updates module; the dev build loads code live from the PC, and older dev binaries
// don't include the module at all, so everything here is guarded and imported lazily.
import { requireOptionalNativeModule } from 'expo';
import { Alert, Platform } from 'react-native';

const available = Platform.OS !== 'web' && !__DEV__ && !!requireOptionalNativeModule('ExpoUpdates');

export interface UpdateInfo {
  enabled: boolean;
  channel: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  createdAt: Date | null;
  embedded: boolean;
}

export async function getUpdateInfo(): Promise<UpdateInfo> {
  if (!available) {
    return { enabled: false, channel: null, runtimeVersion: null, updateId: null, createdAt: null, embedded: true };
  }
  const Updates = await import('expo-updates');
  return {
    enabled: Updates.isEnabled,
    channel: Updates.channel ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    updateId: Updates.updateId ?? null,
    createdAt: Updates.createdAt ?? null,
    embedded: Updates.isEmbeddedLaunch,
  };
}

/**
 * Look for a newer update; if one is downloaded, offer to restart into it.
 * @param quiet don't say anything when there's nothing new (the launch-time check).
 */
export async function checkForUpdate(quiet = true): Promise<void> {
  if (!available) {
    if (!quiet) Alert.alert('Updates', 'Updates only work in the release build of Rakki.');
    return;
  }
  const Updates = await import('expo-updates');
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      if (!quiet) Alert.alert('Rakki is up to date');
      return;
    }
    await Updates.fetchUpdateAsync();
    Alert.alert('Update ready', 'A new version of Rakki has downloaded.', [
      { text: 'Later', style: 'cancel' },
      { text: 'Restart now', onPress: () => void Updates.reloadAsync() },
    ]);
  } catch (e) {
    if (!quiet) Alert.alert('Couldn’t check for updates', e instanceof Error ? e.message : String(e));
  }
}
