// Opening items. Album/artist/playlist pages are shared routes inside every tab, so pushing
// them keeps you in the tab you came from, like Spotify.
import { router } from 'expo-router';

import type { BaseItem } from '@/api/jellyfin';

export const openAlbum = (id: string) => router.push(`/album/${id}`);
export const openArtist = (id: string) => router.push(`/artist/${id}`);
export const openPlaylist = (id: string) => router.push(`/playlist/${id}`);
export const openGenre = (name: string) => router.push(`/genre/${encodeURIComponent(name)}`);

/** Open whatever this item is on its own page (songs open their album). */
export function openItem(item: BaseItem) {
  switch (item.Type) {
    case 'MusicArtist':
      return openArtist(item.Id);
    case 'Playlist':
      return openPlaylist(item.Id);
    case 'Audio':
      return item.AlbumId ? openAlbum(item.AlbumId) : undefined;
    default:
      return openAlbum(item.Id);
  }
}
