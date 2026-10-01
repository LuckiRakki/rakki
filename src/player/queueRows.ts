// The queue screen's list: section headers and songs in one flat, reorderable list.
import type { QueueEntry } from '@/player/store';

export type QueueRow = { kind: 'header'; key: string; title: string } | { kind: 'entry'; key: string; entry: QueueEntry };

export const QUEUED_HEADER = 'header:queued';
export const CONTEXT_HEADER = 'header:context';

/** Rows for everything after the current song: "Next in queue", then "Next from <source>". */
export function queueRows(upcoming: QueueEntry[], contextTitle: string): QueueRow[] {
  let split = 0;
  while (upcoming[split]?.origin === 'queued') split++;
  const queued = upcoming.slice(0, split);
  const rest = upcoming.slice(split);
  return [
    ...(queued.length ? [{ kind: 'header' as const, key: QUEUED_HEADER, title: 'Next in queue' }] : []),
    ...queued.map((entry) => ({ kind: 'entry' as const, key: entry.key, entry })),
    ...(rest.length ? [{ kind: 'header' as const, key: CONTEXT_HEADER, title: contextTitle }] : []),
    ...rest.map((entry) => ({ kind: 'entry' as const, key: entry.key, entry })),
  ];
}

/**
 * The upcoming songs after dragging row `from` to `to`. Everything above the "Next from"
 * header is "Next in queue"; everything below it is the rest of the list.
 */
export function reorderedUpcoming(rows: QueueRow[], from: number, to: number): QueueEntry[] {
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  let origin: QueueEntry['origin'] = 'queued';
  const entries: QueueEntry[] = [];
  for (const row of next) {
    if (row.kind === 'header') {
      if (row.key === CONTEXT_HEADER) origin = 'context';
    } else {
      entries.push(row.entry.origin === origin ? row.entry : { ...row.entry, origin });
    }
  }
  return entries;
}
