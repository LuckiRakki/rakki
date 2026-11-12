// Where Tagging is: which tab, and songs another page asked to show (right-click → Open in
// Tagging). Remembered while the app is open.
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { songsOf } from '~/library/actions';
import { go } from '~/nav';
import { pathOf, withPaths } from '~/mrq/client';
import { toast } from '~/ui/overlays';

export type TaggingTab = 'inbox' | 'library' | 'videos' | 'tidy' | 'history';

interface TaggingState {
  tab: TaggingTab;
  /** Library paths to select and show (Open in Tagging), once. */
  focus: { paths: string[]; search?: string; at: number } | null;
  setTab(tab: TaggingTab): void;
}

export const useTagging = create<TaggingState>((set) => ({
  tab: 'inbox',
  focus: null,
  setTab: (tab) => set({ tab }),
}));

/** Show songs (or an album's songs) in Tagging's library table, picked (from a right-click anywhere in Rakki). */
export async function openInTagging(items: BaseItem[]) {
  try {
    const songs = (await Promise.all(items.map((i) => (i.Type === 'Audio' ? [i] : songsOf(i))))).flat().filter((s) => s.Type === 'Audio');
    const full = await withPaths(songs);
    const paths = (await Promise.all(full.map(pathOf))).filter((p): p is string => !!p);
    if (!paths.length) return toast('MRQ doesn’t have these files');
    useTagging.setState({ tab: 'library', focus: { paths, at: Date.now() } });
    go({ name: 'tagging' });
  } catch (e) {
    toast(e instanceof Error ? e.message : 'MRQ didn’t answer');
  }
}

/** Show a search in the library table (an artist, a genre from Tidy Up). */
export function searchInTagging(search: string) {
  useTagging.setState({ tab: 'library', focus: { paths: [], search, at: Date.now() } });
  go({ name: 'tagging' });
}
