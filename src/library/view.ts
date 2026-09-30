// Which chip the Library tab shows. A store (not screen state) so other screens can open
// the Library on a given chip, e.g. Home's "Your playlists → Show all".
import { create } from 'zustand';

import { readPref, writePref } from '@/lib/prefs';

export type LibraryTab = 'playlists' | 'albums' | 'artists';
const KEY = 'rakki.libraryTab';

function saved(): LibraryTab {
  const v = readPref(KEY);
  return v === 'playlists' || v === 'artists' || v === 'albums' ? v : 'albums';
}

export const useLibraryView = create<{ tab: LibraryTab; setTab: (tab: LibraryTab) => void }>((set) => ({
  tab: saved(),
  setTab: (tab) => {
    writePref(KEY, tab);
    set({ tab });
  },
}));
