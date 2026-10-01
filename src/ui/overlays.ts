// App-wide overlays opened from anywhere: the long-press menu, the Add to playlist sheet, a
// pick-one options sheet (e.g. Library sort) and short confirmation toasts. Their hosts live once in the root layout.
import { create } from 'zustand';

import { thud } from '@/lib/haptics';
import type { BaseItem } from '@/api/jellyfin';

/** Where a menu was opened from, for context-only actions (e.g. remove from this playlist). */
export interface MenuContext {
  playlistId?: string;
  /** The song's PlaylistItemId in that playlist. */
  entryId?: string;
  /** Opened from the full player (adds player-only actions like the sleep timer). */
  fromPlayer?: boolean;
}

/** A pick-one sheet: a title and choices, the current one ticked. */
export interface OptionsSheet {
  title: string;
  options: { key: string; label: string }[];
  selected?: string;
  onSelect(key: string): void;
}

interface Overlays {
  menu: BaseItem | null;
  menuContext: MenuContext | null;
  addTo: { items: BaseItem[]; title: string } | null;
  toast: { text: string; id: number } | null;
  options: OptionsSheet | null;
  openMenu(item: BaseItem, context?: MenuContext): void;
  closeMenu(): void;
  /** Songs to add; `title` is what the sheet says it's adding (a song or an album name). */
  openAddToPlaylist(items: BaseItem[], title: string): void;
  closeAddToPlaylist(): void;
  /** From the menu straight to Add to playlist in one update, so the overlay never closes between. */
  menuToAddToPlaylist(items: BaseItem[], title: string): void;
  openOptions(sheet: OptionsSheet): void;
  /** From the menu straight to an options sheet in one update. */
  menuToOptions(sheet: OptionsSheet): void;
  closeOptions(): void;
  closeAll(): void;
  showToast(text: string): void;
}

export const useOverlays = create<Overlays>((set) => ({
  menu: null,
  menuContext: null,
  addTo: null,
  toast: null,
  options: null,
  openMenu: (item, context) => set({ menu: item, menuContext: context ?? null }),
  closeMenu: () => set({ menu: null, menuContext: null }),
  openAddToPlaylist: (items, title) => set({ addTo: { items, title } }),
  closeAddToPlaylist: () => set({ addTo: null }),
  menuToAddToPlaylist: (items, title) => set({ menu: null, menuContext: null, addTo: { items, title } }),
  openOptions: (sheet) => set({ options: sheet }),
  menuToOptions: (sheet) => set({ menu: null, menuContext: null, options: sheet }),
  closeOptions: () => set({ options: null }),
  closeAll: () => set({ menu: null, menuContext: null, addTo: null, options: null }),
  showToast: (text) => set({ toast: { text, id: Date.now() } }),
}));

/** Open the long-press menu (with a firm haptic bump, like Spotify). */
export const openMenu = (item: BaseItem, context?: MenuContext) => {
  thud();
  useOverlays.getState().openMenu(item, context);
};
export const openOptions = (sheet: OptionsSheet) => useOverlays.getState().openOptions(sheet);
export const openAddToPlaylist = (items: BaseItem[], title: string) => useOverlays.getState().openAddToPlaylist(items, title);
export const showToast = (text: string) => useOverlays.getState().showToast(text);

// Web dev preview only: lets the menus be opened from the browser console for testing.
if (__DEV__ && typeof window !== 'undefined') {
  (globalThis as { __rakkiOverlays?: typeof useOverlays }).__rakkiOverlays = useOverlays;
}
