// An item as a list already has it (a shelf, the library, search), so the page it opens can draw
// its header at once (name, cover, artist) while the full item loads: the page doesn't open
// blank and then jump when the details arrive.
import type { QueryClient } from '@tanstack/react-query';

import type { BaseItem } from '@/api/jellyfin';

function isItem(x: unknown, id: string): x is BaseItem {
  return !!x && typeof x === 'object' && (x as BaseItem).Id === id && typeof (x as BaseItem).Type === 'string';
}

function findIn(data: unknown, id: string, depth = 0): BaseItem | undefined {
  if (!data || typeof data !== 'object' || depth > 3) return undefined;
  if (isItem(data, id)) return data;
  if (Array.isArray(data)) {
    for (const x of data) {
      if (isItem(x, id)) return x;
      // Lists of { album } (genre tiles) or result groups.
      if (x && typeof x === 'object' && !('Id' in x)) {
        const found = findIn(x, id, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  }
  // { Items } answers, paged lists ({ pages: [{ Items }] }) and grouped results.
  for (const value of Object.values(data)) {
    if (value && typeof value === 'object') {
      const found = findIn(value, id, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** The first cached answer holding the item `id`, if any. */
export function cachedItem(client: QueryClient, id: string | undefined): BaseItem | undefined {
  if (!id) return undefined;
  for (const [, data] of client.getQueriesData({})) {
    const found = findIn(data, id);
    if (found) return found;
  }
  return undefined;
}
