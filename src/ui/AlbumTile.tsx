import { Pressable, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { songCount } from '@/lib/format';
import { Artwork } from '@/ui/Artwork';
import { openAlbum, openItem } from '@/ui/nav';
import { openMenu } from '@/ui/overlays';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

export { openAlbum };

function subtitleOf(item: BaseItem): string {
  if (item.Type === 'MusicArtist') return 'Artist';
  if (item.Type === 'Playlist') return `Playlist${item.ChildCount ? ` · ${songCount(item.ChildCount)}` : ''}`;
  return item.AlbumArtist ?? '';
}

/** Art + title + subtitle for shelves and grids: albums, playlists, and artists (round art). */
export function ItemTile({ item, size, onPress }: { item: BaseItem; size: number; onPress?: () => void }) {
  const t = useTheme();
  const round = item.Type === 'MusicArtist';
  return (
    <Pressable
      onPress={onPress ?? (() => openItem(item))}
      onLongPress={() => openMenu(item)}
      delayLongPress={350}
      style={({ pressed }) => ({ width: size, opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed && !t.reduceMotion ? 0.96 : 1 }] })}>
      <Artwork item={item} size={size} rounded={round ? size / 2 : undefined} />
      <T
        variant="bodyStrong"
        numberOfLines={1}
        style={{ marginTop: 8, fontSize: t.size(14), textAlign: round ? 'center' : 'left' }}>
        {item.Name}
      </T>
      <T variant="caption" numberOfLines={1} style={{ textAlign: round ? 'center' : 'left' }}>
        {subtitleOf(item)}
      </T>
    </Pressable>
  );
}

/** Kept for existing screens. */
export function AlbumTile({ album, size }: { album: BaseItem; size: number }) {
  return <ItemTile item={album} size={size} />;
}

/** Compact Spotify "quick pick" tile: art on the left, name on the right. */
export function QuickTile({ album }: { album: BaseItem }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => openItem(album)}
      onLongPress={() => openMenu(album)}
      delayLongPress={350}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: 56,
        borderRadius: t.radius.art,
        overflow: 'hidden',
        backgroundColor: pressed ? t.colors.surface3 : t.colors.surface2,
        transform: [{ scale: pressed && !t.reduceMotion ? 0.98 : 1 }],
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
