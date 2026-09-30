import type { BaseItem } from '@/api/jellyfin';
import { songCount } from '@/lib/format';

/** What a search result is: "Song · Tame Impala", "Album · Weezer", "Artist", "Playlist · 12 songs". */
export function kindLine(item: BaseItem): string {
  switch (item.Type) {
    case 'Audio':
      return ['Song', artistLine(item)].filter(Boolean).join(' · ');
    case 'MusicAlbum':
      return ['Album', item.AlbumArtist].filter(Boolean).join(' · ');
    case 'MusicArtist':
      return 'Artist';
    case 'Playlist':
      return item.ChildCount ? `Playlist · ${songCount(item.ChildCount)}` : 'Playlist';
    case 'Genre':
      return 'Genre';
    default:
      return '';
  }
}

/** "Artist A, Artist B" for a track, falling back to the album artist. */
export function artistLine(item: BaseItem): string {
  if (item.Artists?.length) return item.Artists.join(', ');
  return item.AlbumArtist ?? '';
}
