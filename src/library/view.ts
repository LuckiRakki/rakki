// How the Library tab looks: which chip is showing, and per chip the sort order and grid/list
// layout. A store (not screen state) so other screens can open the Library on a given chip,
// e.g. Home's "Your playlists → Show all". Remembered between launches.
import { create } from 'zustand';

import { readPref, writePref } from '@/lib/prefs';

export type LibraryTab = 'playlists' | 'albums' | 'artists' | 'downloads';
export type LibraryLayout = 'grid' | 'list';

export interface SortOption {
  key: string;
  label: string;
  sortBy: string;
  sortOrder: 'Ascending' | 'Descending';
}

export const SORTS: Record<LibraryTab, SortOption[]> = {
  playlists: [
    { key: 'recent', label: 'Recently added', sortBy: 'DateCreated', sortOrder: 'Descending' },
    { key: 'alpha', label: 'Alphabetical', sortBy: 'SortName', sortOrder: 'Ascending' },
  ],
  albums: [
    { key: 'alpha', label: 'Alphabetical', sortBy: 'SortName', sortOrder: 'Ascending' },
    { key: 'recent', label: 'Recently added', sortBy: 'DateCreated,SortName', sortOrder: 'Descending' },
    { key: 'artist', label: 'Artist', sortBy: 'AlbumArtist,SortName', sortOrder: 'Ascending' },
    { key: 'year', label: 'Release year', sortBy: 'ProductionYear,PremiereDate,SortName', sortOrder: 'Descending' },
  ],
  artists: [
    { key: 'alpha', label: 'Alphabetical', sortBy: 'SortName', sortOrder: 'Ascending' },
    { key: 'recent', label: 'Recently added', sortBy: 'DateCreated,SortName', sortOrder: 'Descending' },
  ],
  // Sorted on the phone (downloads aren't a server query).
  downloads: [
    { key: 'recent', label: 'Recently downloaded', sortBy: '', sortOrder: 'Descending' },
    { key: 'alpha', label: 'Alphabetical', sortBy: '', sortOrder: 'Ascending' },
  ],
};

const DEFAULT_LAYOUT: Record<LibraryTab, LibraryLayout> = { playlists: 'list', albums: 'grid', artists: 'list', downloads: 'list' };
const TAB_KEY = 'rakki.libraryTab';
const VIEW_KEY = 'rakki.libraryView';

interface Saved {
  sort: Partial<Record<LibraryTab, string>>;
  layout: Partial<Record<LibraryTab, LibraryLayout>>;
}

function savedTab(): LibraryTab {
  const v = readPref(TAB_KEY);
  return v === 'playlists' || v === 'artists' || v === 'albums' || v === 'downloads' ? v : 'albums';
}

function savedView(): Saved {
  try {
    const v = JSON.parse(readPref(VIEW_KEY) ?? '{}') as Partial<Saved>;
    return { sort: v.sort ?? {}, layout: v.layout ?? {} };
  } catch {
    return { sort: {}, layout: {} };
  }
}

interface LibraryView extends Saved {
  tab: LibraryTab;
  setTab(tab: LibraryTab): void;
  setSort(tab: LibraryTab, key: string): void;
  toggleLayout(tab: LibraryTab): void;
}

export const useLibraryView = create<LibraryView>((set, get) => {
  const persist = () => writePref(VIEW_KEY, JSON.stringify({ sort: get().sort, layout: get().layout }));
  return {
    tab: savedTab(),
    ...savedView(),
    setTab: (tab) => {
      writePref(TAB_KEY, tab);
      set({ tab });
    },
    setSort: (tab, key) => {
      set({ sort: { ...get().sort, [tab]: key } });
      persist();
    },
    toggleLayout: (tab) => {
      const current = get().layout[tab] ?? DEFAULT_LAYOUT[tab];
      set({ layout: { ...get().layout, [tab]: current === 'grid' ? 'list' : 'grid' } });
      persist();
    },
  };
});

/** The current sort for a chip (first option if none chosen yet). */
export function sortFor(view: Saved, tab: LibraryTab): SortOption {
  return SORTS[tab].find((s) => s.key === view.sort[tab]) ?? SORTS[tab][0];
}

export function layoutFor(view: Saved, tab: LibraryTab): LibraryLayout {
  return view.layout[tab] ?? DEFAULT_LAYOUT[tab];
}
