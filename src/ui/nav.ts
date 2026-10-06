// Opening items. Album/artist/playlist pages are shared routes inside every tab, so pushing
// them keeps you in the tab you came from, like Spotify.
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { useLibraryView, type LibraryTab } from '@/library/view';

/** Screens presented over the tabs. Pages can't open underneath them, so close them first. */
const MODALS = [
  '/player',
  '/queue',
  '/lyrics',
  '/video',
  '/video-queue',
  '/settings',
  '/downloads',
  '/customize',
  '/lyrics-style',
  '/add-account',
  '/add-station',
  '/edit-station',
  '/library-tabs',
];
let overModal = false;
let currentPath = '/';

/** The screen showing now (the performance log notes it). */
export function currentPathname(): string {
  return currentPath;
}

/** Mounted once in the root layout: keeps track of whether a modal screen is showing. */
export function useModalTracker() {
  const pathname = usePathname();
  useEffect(() => {
    currentPath = pathname;
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

/** Open the full player from anywhere (a widget tap), closing whatever modal is up. */
export function openPlayer() {
  if (currentPath === '/player') return;
  if (overModal) {
    overModal = false;
    router.dismissAll();
  }
  router.push('/player');
}

/**
 * A link that arrived while the app was closed (src/app/+native-intent.ts), opened once the
 * app has started and the saved queue is back.
 */
let pendingLink: string | null = null;
export function setPendingLink(path: string) {
  pendingLink = path;
}
export function takePendingLink(): string | null {
  const link = pendingLink;
  pendingLink = null;
  return link;
}

export const openAlbum = (id: string) => goTo(`/album/${id}`);
export const openArtist = (id: string) => goTo(`/artist/${id}`);
export const openPlaylist = (id: string) => goTo(`/playlist/${id}`);
export const openGenre = (name: string) => goTo(`/genre/${encodeURIComponent(name)}`);
/** All of an artist's albums, or all their singles and EPs. */
export const openReleases = (artistId: string, kind: 'albums' | 'singles') => goTo(`/releases/${artistId}?kind=${kind}`);

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
