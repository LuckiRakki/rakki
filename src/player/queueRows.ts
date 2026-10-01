// The queue screen's list: section headers and songs in one flat, reorderable list.
import type { QueueEntry } from '@/player/store';

export type QueueRow = { kind: 'header'; key: string; title: string } | { kind: 'entry'; key: string; entry: QueueEntry };

export const QUEUED_HEADER = 'header:queued';
export const CONTEXT_HEADER = 'header:context';
export const AUTOPLAY_HEADER = 'header:autoplay';

/**
 * Rows for everything after the current song: "Next in queue", "Next from <source>", then
 * "Autoplay" (similar songs added when the queue was running out).
 */
export function queueRows(upcoming: QueueEntry[], contextTitle: string): QueueRow[] {
  let split = 0;
  while (upcoming[split]?.origin === 'queued') split++;
  const queued = upcoming.slice(0, split);
  const rest = upcoming.slice(split);
  const context = rest.filter((e) => e.origin !== 'autoplay');
  const autoplay = rest.filter((e) => e.origin === 'autoplay');
  const rows = (list: QueueEntry[]) => list.map((entry) => ({ kind: 'entry' as const, key: entry.key, entry }));
  return [
    ...(queued.length ? [{ kind: 'header' as const, key: QUEUED_HEADER, title: 'Next in queue' }] : []),
    ...rows(queued),
    ...(context.length ? [{ kind: 'header' as const, key: CONTEXT_HEADER, title: contextTitle }] : []),
    ...rows(context),
    ...(autoplay.length ? [{ kind: 'header' as const, key: AUTOPLAY_HEADER, title: 'Autoplay · similar songs' }] : []),
    ...rows(autoplay),
  ];
}

/**
 * The upcoming songs after dragging row `from` to `to`. Songs take the section they land in:
 * above "Next from" is "Next in queue", below it the rest, below "Autoplay" autoplay.
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
      else if (row.key === AUTOPLAY_HEADER) origin = 'autoplay';
    } else {
      entries.push(row.entry.origin === origin ? row.entry : { ...row.entry, origin });
    }
  }
  return entries;
}
