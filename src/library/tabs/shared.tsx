// What every Library tab's list uses: tile sizes, the list's props, loading in order, the empty
// search line and pull to refresh.
import { useState, type ReactElement } from 'react';
import { RefreshControl, useWindowDimensions } from 'react-native';

import { useLibraryView, type LibraryLayout, type SortOption } from '@/library/view';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { partOf, useReveal, useRowFade } from '@/ui/Reveal';

/**
 * Tile width for an n-column grid with the standard side gutters. Album grids follow Customize →
 * Album grid columns; `extra` adds columns (artists' round tiles).
 */
export function useTileSize(extra = 0) {
  const t = useTheme();
  const columns = t.appearance.gridColumns + extra;
  const { width } = useWindowDimensions();
  const gap = t.space.lg;
  return { gap, columns, tile: Math.floor((width - t.space.lg * 2 - gap * (columns - 1)) / columns) };
}

export interface ListProps {
  header: ReactElement;
  sort: SortOption;
  layout: LibraryLayout;
  /** The search typed above the list ('' for everything). */
  filter: string;
}

/**
 * A tab's list loading in order: placeholders of its tiles or rows (the layout it'll have) hold
 * the screen while it loads, then the first screenful fades in, one after another. Only the
 * first time: a list that's already loaded (switching back to a tab) is simply there.
 */
export function useListReveal(q: { data?: unknown; isError: boolean }) {
  const [step] = useReveal([partOf(q.data, { failed: q.isError })]);
  return { step, fade: useRowFade(step) };
}

/** Shown when a search finds nothing. */
export function NoMatches({ filter }: { filter: string }) {
  const t = useTheme();
  return (
    <T variant="caption" style={{ textAlign: 'center', padding: t.space.xl }}>
      {`Nothing matches “${filter}”`}
    </T>
  );
}

/**
 * Pull to refresh, like Home: with Random it reshuffles, otherwise it reloads from the server.
 * `loadingNew` keeps the spinner up while a new shuffle loads (the old list stays meanwhile).
 */
export function usePullToRefresh(sort: SortOption, refetch?: () => Promise<unknown>, loadingNew = false) {
  const t = useTheme();
  const [pulling, setPulling] = useState(false);
  const onRefresh = async () => {
    setPulling(true);
    try {
      if (sort.key === 'random') useLibraryView.getState().reshuffle();
      else await refetch?.();
    } finally {
      setPulling(false);
    }
  };
  return <RefreshControl refreshing={pulling || loadingNew} onRefresh={() => void onRefresh()} tintColor={t.colors.text} />;
}
