import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';

import { BackButton } from '@/ui/CollectionHeader';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/** Shown offline for an album, playlist or artist with nothing downloaded. */
export function OfflineUnavailable() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, alignItems: 'center', justifyContent: 'center', padding: t.space.xl }}>
      <Ionicons name="cloud-offline-outline" size={44} color={t.colors.textMuted} />
      <T variant="heading" style={{ marginTop: t.space.md, textAlign: 'center' }}>
        Not available offline
      </T>
      <T variant="caption" style={{ marginTop: t.space.xs, textAlign: 'center' }}>
        Download it while you&apos;re online to play it here.
      </T>
      <BackButton onPress={() => router.back()} />
    </View>
  );
}
