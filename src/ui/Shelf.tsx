import { FlatList, Pressable, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { ItemTile } from '@/ui/AlbumTile';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/** A section title with an optional "Show all" on the right. */
export function SectionTitle({ title, onShowAll }: { title: string; onShowAll?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: t.space.lg, marginBottom: t.space.md }}>
      <T variant="heading" style={{ flex: 1 }}>
        {title}
      </T>
      {onShowAll ? (
        <Pressable hitSlop={8} onPress={onShowAll}>
          <T variant="caption" style={{ fontFamily: t.fonts.bold }}>
            Show all
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A titled horizontal row of tiles (albums, artists, playlists). Renders nothing when empty. */
export function Shelf({
  title,
  items,
  size = 148,
  onShowAll,
}: {
  title: string;
  items: BaseItem[] | undefined;
  size?: number;
  onShowAll?: () => void;
}) {
  const t = useTheme();
  if (!items?.length) return null;
  return (
    <View style={{ marginTop: t.space.xl }}>
      <SectionTitle title={title} onShowAll={onShowAll} />
      <FlatList
        horizontal
        data={items}
        keyExtractor={(a) => a.Id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: t.space.lg, gap: t.space.lg }}
        renderItem={({ item }) => <ItemTile item={item} size={size} />}
      />
    </View>
  );
}
