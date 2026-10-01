import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { confirmRemove, downloadCollection, retryFailed } from '@/downloads/manager';
import { useCollectionStatus, type CollectionKind } from '@/downloads/store';
import { ProgressRing } from '@/ui/ProgressRing';
import { useTheme } from '@/ui/theme';

const SIZE = 28;

/**
 * Spotify's download toggle for an album, playlist or Liked Songs: an outlined arrow, a ring
 * filling up while it downloads, a filled accent arrow when it's all on the phone.
 */
export function DownloadButton({ kind, item }: { kind: CollectionKind; item: BaseItem }) {
  const t = useTheme();
  const id = kind === 'liked' ? 'liked' : item.Id;
  const status = useCollectionStatus(id);

  if (status.state === 'done') {
    return (
      <Pressable hitSlop={8} accessibilityLabel="Remove download" onPress={() => confirmRemove(id, item.Name)}>
        <Ionicons name="arrow-down-circle" size={SIZE} color={t.colors.accent} />
      </Pressable>
    );
  }
  if (status.state === 'error') {
    return (
      <Pressable hitSlop={8} accessibilityLabel="Some songs didn't download. Try again" onPress={retryFailed}>
        <Ionicons name="alert-circle-outline" size={SIZE} color={t.colors.danger} />
      </Pressable>
    );
  }
  if (status.state === 'downloading') {
    return (
      <Pressable
        hitSlop={8}
        accessibilityLabel={`Downloading, ${status.done} of ${status.total} songs. Tap to cancel`}
        onPress={() => confirmRemove(id, item.Name)}
        style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <ProgressRing progress={status.fraction} size={SIZE - 4} stroke={2.5} color={t.colors.accent} track={t.colors.border} />
        <View style={{ position: 'absolute' }}>
          <Ionicons name="arrow-down" size={13} color={t.colors.accent} />
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable hitSlop={8} accessibilityLabel="Download" onPress={() => void downloadCollection(kind, item)}>
      <Ionicons name="arrow-down-circle-outline" size={SIZE} color={t.colors.textSecondary} />
    </Pressable>
  );
}
