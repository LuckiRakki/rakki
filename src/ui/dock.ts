// The bottom dock (the mini player and the tab bar) floats over the pages, which scroll on
// underneath it. Lists end with this much extra room so their last row can scroll clear of it.
import { create } from 'zustand';

export const useDock = create<{ height: number }>(() => ({ height: 0 }));

/** The dock's height: room to leave at the end of a page in a tab. */
export function useDockSpace() {
  return useDock((s) => s.height);
}
