// Opening items. Album/artist/playlist pages are shared routes inside every tab, so pushing
// them keeps you in the tab you came from, like Spotify.
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { useLibraryView, type LibraryTab } from '@/library/view';

/** Screens presented over the tabs. Pages can't open underneath them, so close them first. */
const MODALS = ['/player', '/queue', '/lyrics', '/settings', '/downloads', '/customize', '/lyrics-style', '/add-account'];
let overModal = false;

/** Mounted once in the root layout: keeps track of whether a modal screen is showing. */
export function useModalTracker() {
  const pathname = usePathname();
  useEffect(() => {
    overModal = MODALS.includes(pathname);
  }, [pathname]);
}

/** Go to a page in the tabs from anywhere, closing the player/queue/lyrics if they're up. */
export function goTo(path: string) {
  if (overModal) {
    overModal = false;
    router.dismissAll();
  }
  router.push(path as never);
}

export const openAlbum = (id: string) => goTo(`/album/${id}`);
export const openArtist = (id: string) => goTo(`/artist/${id}`);
export const openPlaylist = (id: string) => goTo(`/playlist/${id}`);
export const openGenre = (name: string) => goTo(`/genre/${encodeURIComponent(name)}`);

/** Switch to the Library tab, showing the given chip. */
export function openLibrary(tab: LibraryTab) {
  useLibraryView.getState().setTab(tab);
  if (overModal) {
    overModal = false;
    router.dismissAll();
  }
  router.navigate('/(tabs)/(library)/library' as never);
}

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
