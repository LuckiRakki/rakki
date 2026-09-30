// App-wide overlays opened from anywhere: the long-press menu, the Add to playlist sheet and
// short confirmation toasts. Their hosts live once in the root layout.
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';

interface Overlays {
  menu: BaseItem | null;
  addTo: { items: BaseItem[]; title: string } | null;
  toast: { text: string; id: number } | null;
  openMenu(item: BaseItem): void;
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
  addTo: null,
  toast: null,
  openMenu: (item) => set({ menu: item }),
  closeMenu: () => set({ menu: null }),
  openAddToPlaylist: (items, title) => set({ addTo: { items, title } }),
  closeAddToPlaylist: () => set({ addTo: null }),
  menuToAddToPlaylist: (items, title) => set({ menu: null, addTo: { items, title } }),
  closeAll: () => set({ menu: null, addTo: null }),
  showToast: (text) => set({ toast: { text, id: Date.now() } }),
}));

export const openMenu = (item: BaseItem) => useOverlays.getState().openMenu(item);
export const showToast = (text: string) => useOverlays.getState().showToast(text);

// Web dev preview only: lets the menus be opened from the browser console for testing.
if (__DEV__ && typeof window !== 'undefined') {
  (globalThis as { __rakkiOverlays?: typeof useOverlays }).__rakkiOverlays = useOverlays;
}
