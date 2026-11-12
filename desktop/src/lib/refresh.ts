// Refresh (the title bar's button): every page you have open loads again from the server, in
// place. What's on screen stays until the new answer arrives, so nothing blanks or jumps; pages
// you aren't looking at load fresh the next time you open them. It also runs by itself at
// midnight and at noon (a new day's Home, mixes and "recently added"), and on the first chance
// after either if the computer was asleep or Rakki was in the tray.
import { useIsFetching } from '@tanstack/react-query';
import { create } from 'zustand';

import { ensureSearchIndex } from '@/search/index';
import { queryClient } from '~/queries';

/** Answers that aren't the library's (or that look after themselves): left as they are. */
const SKIP = new Set(['searchIndex', 'lyricsSearch', 'search', 'me']);

const useRefresh = create<{ running: boolean }>(() => ({ running: false }));

/** Whether a refresh is under way (the button turns while it is). */
export function useRefreshing(): boolean {
  const running = useRefresh((s) => s.running);
  const fetching = useIsFetching() > 0;
  return running && fetching;
}

let lastSlot = '';

/** Midnight to noon, noon to midnight: the half of which day it is now. */
function slot(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours() < 12 ? 'am' : 'pm'}`;
}

export async function refreshAll(): Promise<void> {
  lastSlot = slot();
  useRefresh.setState({ running: true });
  try {
    await queryClient.invalidateQueries({ predicate: (q) => !SKIP.has(String(q.queryKey[0])), refetchType: 'active' });
  } catch {
    // The server didn't answer: what was showing stays.
  } finally {
    useRefresh.setState({ running: false });
  }
  void ensureSearchIndex();
}

/** The automatic refresh at midnight and noon (checked every minute, and when the window comes back). */
export function startAutoRefresh(): () => void {
  lastSlot = slot();
  const check = () => {
    if (slot() !== lastSlot) void refreshAll();
  };
  const id = setInterval(check, 60_000);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  return () => {
    clearInterval(id);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
  };
}
