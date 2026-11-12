// Tagging: MRQ (the server's music tagger) inside Rakki. Inbox = new downloads to tag and send to
// the library; Library = every song file as a table to fix tags in bulk; Videos = music videos;
// Tidy Up = whole-library checks; History = every edit, with Undo.
// Right-click a song, album or artist anywhere in Rakki → Open in Tagging lands here with it picked.
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { go } from '~/nav';
import { getGroups, getVideos, useJobs } from '~/tagging/api';
import { useMrqUrl } from '~/tagging/data';
import { History } from '~/tagging/History';
import { Inbox } from '~/tagging/Inbox';
import { LibraryTab } from '~/tagging/LibraryTab';
import { stopPreview } from '~/tagging/preview';
import { useTagging, type TaggingTab } from '~/tagging/store';
import { TidyUp } from '~/tagging/TidyUp';
import { Videos } from '~/tagging/Videos';
import { TagIcon } from '~/ui/icons';
import { Empty } from '~/ui/states';

const TABS: { id: TaggingTab; label: string; key: string }[] = [
  { id: 'inbox', label: 'Inbox', key: '1' },
  { id: 'library', label: 'Library', key: '2' },
  { id: 'videos', label: 'Music Videos', key: '3' },
  { id: 'tidy', label: 'Tidy Up', key: '4' },
  { id: 'history', label: 'History', key: '5' },
];

export function TaggingPage() {
  const url = useMrqUrl();
  const tab = useTagging((s) => s.tab);
  const setTab = useTagging((s) => s.setTab);
  // Counts beside the tabs (the tabs share these lists, so they're asked for once).
  const groups = useQuery({ queryKey: ['mrq', url, 'groups'], queryFn: getGroups, refetchInterval: 15_000, enabled: !!url });
  const videos = useQuery({ queryKey: ['mrq', url, 'videos', 'S'], queryFn: () => getVideos('S'), refetchInterval: 20_000, enabled: !!url });
  const waiting = groups.data?.reduce((n, g) => n + g.count, 0) ?? 0;
  const counts: Partial<Record<TaggingTab, number>> = { inbox: waiting, videos: videos.data?.counts.S };

  // Alt+1…5 switch tabs; leaving Tagging stops a song you were listening to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const t = TABS.find((x) => x.key === e.key);
      if (!t) return;
      e.preventDefault();
      setTab(t.id);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stopPreview();
    };
  }, [setTab]);

  if (!url) {
    return (
      <div className="page">
        <Empty
          icon={TagIcon}
          title="Connect MRQ to Tag Music"
          detail="Tagging uses MRQ, the tagger on your server. Add its address in Settings → Connections."
          action={{ label: 'Open Connections', run: () => go({ name: 'settings', section: 'connections' }) }}
        />
      </div>
    );
  }

  return (
    <div className="tagging">
      <header className="tg-head">
        <h1>Tagging</h1>
        <nav className="filters tg-tabs" role="tablist" aria-label="Tagging">
          {TABS.map((t) => (
            <button key={t.id} role="tab" className={tab === t.id ? 'on' : ''} aria-selected={tab === t.id} onClick={() => setTab(t.id)} title={`${t.label} (Alt+${t.key})`}>
              {t.label}
              {counts[t.id] ? <span className="tg-tab-count">{counts[t.id]}</span> : null}
            </button>
          ))}
        </nav>
        <Jobs />
      </header>
      <div className="tg-body" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === 'inbox' ? <Inbox /> : tab === 'library' ? <LibraryTab /> : tab === 'videos' ? <Videos /> : tab === 'tidy' ? <TidyUp /> : <History />}
      </div>
    </div>
  );
}

/** What MRQ is busy with right now (a big save, an undo, a scan), with how far along it is. */
function Jobs() {
  const jobs = useJobs((s) => s.jobs);
  const list = Object.values(jobs);
  if (!list.length) return null;
  const j = list[0];
  const pct = j.total ? Math.round((j.done / j.total) * 100) : null;
  return (
    <div className="tg-job" role="status" aria-live="polite">
      <span className="tg-job-bar">
        <i style={{ width: pct === null ? '30%' : `${pct}%` }} className={pct === null ? 'indeterminate' : ''} />
      </span>
      <span className="tg-job-text">
        {j.desc}
        {j.total ? ` · ${j.done} of ${j.total}` : ''}
        {list.length > 1 ? ` · ${list.length - 1} more` : ''}
      </span>
    </div>
  );
}
