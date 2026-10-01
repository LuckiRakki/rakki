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

/** Singles and EPs: releases with only a few songs (an artist's Discography is the rest). */
export function isSingleOrEp(album: BaseItem): boolean {
  const count = album.ChildCount ?? 0;
  return count > 0 && count <= 6;
}

/** "Single" (up to 3 songs), "EP" (up to 6) or "Album". */
export function releaseKind(album: BaseItem): string {
  const count = album.ChildCount ?? 0;
  if (count > 0 && count <= 3) return 'Single';
  return isSingleOrEp(album) ? 'EP' : 'Album';
}
