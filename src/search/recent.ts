// Spotify-style recent searches: the results you opened (not the text you typed), newest
// first, kept on the device.
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { readPref, writePref } from '@/lib/prefs';

const OLD_KEY = 'rakki.recentSearches';
const keyFor = (userId: string) => `rakki.recentSearches.${userId}`;
const MAX = 20;
let currentUser: string | null = null;

function read(key: string): BaseItem[] | null {
  try {
    const v = JSON.parse(readPref(key) ?? 'null');
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function save(items: BaseItem[]) {
  if (currentUser) writePref(keyFor(currentUser), JSON.stringify(items));
}

/** Recent searches belong to an account (another server's items wouldn't open). */
export function loadRecentSearches(userId: string) {
  if (currentUser === userId) return;
  currentUser = userId;
  // Before accounts, there was one list: it becomes the first account's.
  let items = read(keyFor(userId));
  if (!items) {
    items = read(OLD_KEY) ?? [];
    writePref(OLD_KEY, '[]');
    writePref(keyFor(userId), JSON.stringify(items));
  }
  useRecentSearches.setState({ items });
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
  items: [],
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
