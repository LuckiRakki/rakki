import type { BaseItem } from '@/api/jellyfin';

/** "Artist A, Artist B" for a track, falling back to the album artist. */
export function artistLine(item: BaseItem): string {
  if (item.Artists?.length) return item.Artists.join(', ');
  return item.AlbumArtist ?? '';
}
