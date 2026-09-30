import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { Artwork } from '@/ui/Artwork';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

export function openAlbum(id: string) {
  router.push(`/album/${id}`);
}

/** Square art + title + artist, for shelves and grids. */
export function AlbumTile({ album, size }: { album: BaseItem; size: number }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => openAlbum(album.Id)}
      style={({ pressed }) => ({ width: size, opacity: pressed ? 0.7 : 1 })}>
      <Artwork item={album} size={size} />
      <T variant="bodyStrong" numberOfLines={1} style={{ marginTop: 8, fontSize: t.size(14) }}>
        {album.Name}
      </T>
      <T variant="caption" numberOfLines={1}>
        {album.AlbumArtist ?? ''}
      </T>
    </Pressable>
  );
}

/** Compact Spotify "quick pick" tile: art on the left, name on the right. */
export function QuickTile({ album }: { album: BaseItem }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => openAlbum(album.Id)}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: 56,
        borderRadius: t.radius.art,
        overflow: 'hidden',
        backgroundColor: pressed ? t.colors.surface3 : t.colors.surface2,
      })}>
      <Artwork item={album} size={56} rounded={0} />
      <View style={{ flex: 1, paddingHorizontal: 10 }}>
        <T numberOfLines={2} style={{ fontFamily: t.fonts.bold, fontSize: t.size(13) }}>
          {album.Name}
        </T>
      </View>
    </Pressable>
  );
}
