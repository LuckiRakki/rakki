import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { useNetwork } from '@/lib/network';
import { probe, useOffline } from '@/lib/online';
import { useSettings } from '@/settings/store';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/**
 * The strip above the mini player while offline: why, and that only downloads play. Tap it to
 * check the server again (or, in Offline mode, to open Settings).
 */
export function OfflineBar() {
  const t = useTheme();
  const offline = useOffline();
  const manual = useSettings((s) => s.offlineMode);
  const connected = useNetwork((s) => s.connected);
  if (!offline) return null;
  const why = manual ? 'Offline mode is on' : connected ? 'Can’t reach your server' : 'No internet connection';
  return (
    <Pressable
      onPress={() => (manual ? router.push('/settings') : void probe())}
      accessibilityLabel={`${why}. Playing downloads only.`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 6,
        backgroundColor: pressed ? t.colors.surface3 : t.colors.surface2,
      })}>
      <Ionicons name="cloud-offline-outline" size={15} color={t.colors.textSecondary} />
      <T variant="caption" style={{ fontSize: t.size(12) }}>
        {why} · Playing downloads only
      </T>
    </Pressable>
  );
}
