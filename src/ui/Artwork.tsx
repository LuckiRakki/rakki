import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { PixelRatio, View, type StyleProp, type ViewStyle } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { colors, radius } from '@/ui/theme';

// Request a few fixed sizes so the same image is shared by the disk cache across screens.
const BUCKETS = [120, 240, 480, 800, 1200];
function bucket(px: number) {
  return BUCKETS.find((b) => b >= px) ?? BUCKETS[BUCKETS.length - 1];
}

/** Album art with an instant blurhash placeholder. Works for albums and tracks. */
export function Artwork({
  item,
  size,
  rounded = radius.art,
  style,
}: {
  item?: BaseItem;
  size: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const client = useAuth((s) => s.client);
  const box = { width: size, height: size, borderRadius: rounded };
  const uri = item && client?.imageUrl(item, bucket(size * PixelRatio.get()));
  const blurhash = item && client?.blurhash(item);

  if (!uri) {
    return (
      <View
        style={[
          box,
          { backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
          style,
        ]}>
        <Ionicons name="musical-notes" size={size * 0.36} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <View style={[box, { overflow: 'hidden', backgroundColor: colors.surface3 }, style]}>
      <Image
        source={{ uri }}
        placeholder={blurhash ? { blurhash } : undefined}
        style={{ width: size, height: size }}
        contentFit="cover"
        transition={180}
        recyclingKey={item?.Id}
        cachePolicy="memory-disk"
      />
    </View>
  );
}
