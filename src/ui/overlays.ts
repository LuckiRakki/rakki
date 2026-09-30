// App-wide overlays opened from anywhere: the long-press menu, the Add to playlist sheet and
// short confirmation toasts. Their hosts live once in the root layout.
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';

/** Where a menu was opened from, for context-only actions (e.g. remove from this playlist). */
export interface MenuContext {
  playlistId?: string;
  /** The song's PlaylistItemId in that playlist. */
  entryId?: string;
}

interface Overlays {
  menu: BaseItem | null;
  menuContext: MenuContext | null;
  addTo: { items: BaseItem[]; title: string } | null;
  toast: { text: string; id: number } | null;
  openMenu(item: BaseItem, context?: MenuContext): void;
  closeMenu(): void;
  /** Songs to add; `title` is what the sheet says it's adding (a song or an album name). */
  openAddToPlaylist(items: BaseItem[], title: string): void;
  closeAddToPlaylist(): void;
  /** From the menu straight to Add to playlist in one update, so the overlay never closes between. */
  menuToAddToPlaylist(items: BaseItem[], title: string): void;
  closeAll(): void;
  showToast(text: string): void;
}

export const useOverlays = create<Overlays>((set) => ({
  menu: null,
  menuContext: null,
  addTo: null,
  toast: null,
  openMenu: (item, context) => set({ menu: item, menuContext: context ?? null }),
  closeMenu: () => set({ menu: null, menuContext: null }),
  openAddToPlaylist: (items, title) => set({ addTo: { items, title } }),
  closeAddToPlaylist: () => set({ addTo: null }),
  menuToAddToPlaylist: (items, title) => set({ menu: null, menuContext: null, addTo: { items, title } }),
  closeAll: () => set({ menu: null, menuContext: null, addTo: null }),
  showToast: (text) => set({ toast: { text, id: Date.now() } }),
}));

export const openMenu = (item: BaseItem, context?: MenuContext) => useOverlays.getState().openMenu(item, context);
export const showToast = (text: string) => useOverlays.getState().showToast(text);

// Web dev preview only: lets the menus be opened from the browser console for testing.
if (__DEV__ && typeof window !== 'undefined') {
  (globalThis as { __rakkiOverlays?: typeof useOverlays }).__rakkiOverlays = useOverlays;
}
