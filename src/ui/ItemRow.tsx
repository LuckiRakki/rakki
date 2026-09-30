import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { Artwork } from '@/ui/Artwork';
import { openItem } from '@/ui/nav';
import { openMenu } from '@/ui/overlays';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/** A list row for an album, artist (round art) or playlist: art, title, subtitle. */
export function ItemRow({
  item,
  subtitle,
  onPress,
  art,
}: {
  item: BaseItem;
  subtitle: string;
  onPress?: () => void;
  /** Replaces the artwork (e.g. the Liked Songs heart tile). */
  art?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress ?? (() => openItem(item))}
      onLongPress={() => openMenu(item)}
      delayLongPress={350}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.sm,
        backgroundColor: pressed ? t.colors.surface : 'transparent',
      })}>
      {art ?? <Artwork item={item} size={56} rounded={item.Type === 'MusicArtist' ? 28 : undefined} />}
      <View style={{ flex: 1, marginLeft: t.space.md }}>
        <T variant="bodyStrong" numberOfLines={1}>
          {item.Name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {subtitle}
        </T>
      </View>
    </Pressable>
  );
}

/** A pill-shaped filter chip (Library / Search). */
export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: t.space.md,
        height: 32,
        justifyContent: 'center',
        borderRadius: t.radius.pill,
        backgroundColor: active ? t.colors.accent : t.colors.surface2,
      }}>
      <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(13), color: active ? '#000' : t.colors.text }}>{label}</T>
    </Pressable>
  );
}
