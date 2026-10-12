// Where the main area is, with back and forward like a browser (and the mouse's side buttons).
import { create } from 'zustand';

export type Route =
  | { name: 'home' }
  | { name: 'search'; term?: string }
  | { name: 'albums' }
  | { name: 'songs' }
  | { name: 'artists' }
  | { name: 'genres' }
  | { name: 'genre'; id: string }
  | { name: 'playlists' }
  | { name: 'mixes' }
  | { name: 'radio' }
  | { name: 'videos' }
  | { name: 'liked' }
  | { name: 'settings' }
  | { name: 'album'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'playlist'; id: string };

interface NavState {
  stack: Route[];
  at: number;
  route: Route;
  go(route: Route): void;
  back(): void;
  forward(): void;
}

export const useNav = create<NavState>((set, get) => ({
  stack: [{ name: 'home' }],
  at: 0,
  route: { name: 'home' },
  go(route) {
    const { stack, at } = get();
    const next = [...stack.slice(0, at + 1), route].slice(-50);
    set({ stack: next, at: next.length - 1, route });
    document.getElementById('main')?.scrollTo({ top: 0 });
  },
  back() {
    const { stack, at } = get();
    if (at > 0) set({ at: at - 1, route: stack[at - 1] });
  },
  forward() {
    const { stack, at } = get();
    if (at < stack.length - 1) set({ at: at + 1, route: stack[at + 1] });
  },
}));

export const go = (route: Route) => useNav.getState().go(route);

/** Open an item: album, artist or playlist page; a song plays. */
export function openItem(item: { Id: string; Type: string; Name?: string }) {
  if (item.Type === 'MusicAlbum') go({ name: 'album', id: item.Id });
  else if (item.Type === 'MusicArtist') go({ name: 'artist', id: item.Id });
  else if (item.Type === 'Playlist') go({ name: 'playlist', id: item.Id });
  else if (item.Type === 'MusicGenre' || item.Type === 'Genre') go({ name: 'genre', id: item.Name ?? item.Id });
}
