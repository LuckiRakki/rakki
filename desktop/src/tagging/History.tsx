// Tagging → History: every tag edit MRQ made (here, in its own pages, Big Brother's fixes, genre
// merges, music video edits), newest first, each with Undo. Undoing puts back the values from
// before; a value changed again since is left alone and counted.
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { getHistory, type HistoryEntry } from '~/tagging/api';
import { useMrqUrl } from '~/tagging/data';
import { undoEdit } from '~/tagging/LibraryTab';
import { Check, Disc3, HistoryIcon, InboxIcon, MonitorPlay, Undo } from '~/ui/icons';
import { Bar, partOf, revealWith, useReveal } from '~/ui/reveal';
import { confirmAction } from '~/ui/overlays';
import { Empty } from '~/ui/states';

const WHERE: Record<string, { label: string; icon: typeof Check }> = {
  L: { label: 'Library', icon: Disc3 },
  S: { label: 'Inbox', icon: InboxIcon },
  VL: { label: 'Video Library', icon: MonitorPlay },
  VS: { label: 'Video Queue', icon: MonitorPlay },
};

const dayOf = (ts: number) => {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
};
const timeOf = (ts: number) => new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function History() {
  const url = useMrqUrl();
  const q = useQuery({ queryKey: ['mrq', url, 'history'], queryFn: getHistory, refetchInterval: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [step] = useReveal([partOf(q.data, { failed: q.isError })]);

  const days = useMemo(() => {
    const out: [string, HistoryEntry[]][] = [];
    for (const e of q.data ?? []) {
      const d = dayOf(e.ts);
      const last = out[out.length - 1];
      if (last?.[0] === d) last[1].push(e);
      else out.push([d, [e]]);
    }
    return out;
  }, [q.data]);

  const run = async (e: HistoryEntry) => {
    if (e.count > 25 && !(await confirmAction('Undo This Edit?', `Puts back the tags of ${e.count.toLocaleString()} files as they were before “${e.desc}”.`, 'Undo'))) return;
    setBusy(e.id);
    await undoEdit(e.id, e.src === 'S' || e.src === 'L' ? e.src : undefined);
    setBusy(null);
  };

  if (q.isError) return <Empty icon={HistoryIcon} title="Couldn’t Load History" detail={q.error instanceof Error ? q.error.message : undefined} action={{ label: 'Try Again', run: () => void q.refetch() }} />;
  if (q.data && !q.data.length) return <Empty icon={HistoryIcon} title="No Edits Yet" detail="Every tag change you make shows up here, ready to undo." />;

  return (
    <div className="tg-history">
      {step.show === 'placeholder'
        ? Array.from({ length: 8 }, (_, i) => (
            <div key={i} {...revealWith('tg-hist-row skel-row', step)}>
              <span className="tg-hist-icon skel" />
              <Bar width={`${45 + ((i * 13) % 35)}%`} />
            </div>
          ))
        : days.map(([day, list], di) => (
            <section key={day} {...revealWith('tg-hist-day', { ...step, delay: step.delay + Math.min(di, 6) * 40 })}>
              <h3>{day}</h3>
              {list.map((e) => {
                const w = WHERE[e.src] ?? WHERE.L;
                return (
                  <div key={e.id} className={`tg-hist-row${e.undone ? ' undone' : ''}${busy === e.id ? ' busy' : ''}`}>
                    <span className="tg-hist-icon" title={w.label}>
                      <w.icon size={16} />
                    </span>
                    <div className="tg-hist-text">
                      <span className="tg-hist-desc">{e.desc}</span>
                      <span className="tg-hint">
                        {timeOf(e.ts)} · {w.label} · {e.count.toLocaleString()} {e.count === 1 ? 'file' : 'files'}
                      </span>
                    </div>
                    {e.undone ? (
                      <span className="tg-badge off">Undone</span>
                    ) : (
                      <button className="secondary small" disabled={!!busy} onClick={() => void run(e)}>
                        <Undo size={15} /> Undo
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
    </div>
  );
}
