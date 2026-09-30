// Spotify-style recent searches: the results you opened (not the text you typed), newest
// first, kept on the device.
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { readPref, writePref } from '@/lib/prefs';

const KEY = 'rakki.recentSearches';
const MAX = 20;

function load(): BaseItem[] {
  try {
    const v = JSON.parse(readPref(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(items: BaseItem[]) {
  writePref(KEY, JSON.stringify(items));
}

/** Only what rows need to draw and open the item again. */
function slim({ Overview: _o, BackdropImageTags: _b, GenreItems: _g, ...rest }: BaseItem): BaseItem {
  return rest;
}

export const useRecentSearches = create<{
  items: BaseItem[];
  add(item: BaseItem): void;
  remove(id: string): void;
  clear(): void;
}>((set, get) => ({
  items: load(),
  add: (item) => {
    const items = [slim(item), ...get().items.filter((x) => x.Id !== item.Id)].slice(0, MAX);
    save(items);
    set({ items });
  },
  remove: (id) => {
    const items = get().items.filter((x) => x.Id !== id);
    save(items);
    set({ items });
  },
  clear: () => {
    save([]);
    set({ items: [] });
  },
}));

/** Genres aren't Jellyfin items here, so they're stored as a pseudo-item. */
export const genreItem = (name: string): BaseItem => ({ Id: `genre:${name}`, Name: name, Type: 'Genre' });
