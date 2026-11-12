// Tagging → Tidy Up: the whole-library checks, in one place. Big Brother (MRQ's watchdog: tags
// Jellyfin can't read, one artist under several spellings, Jellyfin out of date with the files),
// genres that need a look, artists filed twice, the library index, the downloads folder beets
// imports from, and filling in genres for everything waiting in the inbox.
// Every retag here runs as an undoable edit (History); moving folders (merging artists) can't be.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  artistDupes,
  artistMerge,
  autoGenreCancel,
  autoGenreStart,
  autoGenreStatus,
  bbFix,
  bbFixAll,
  bbIgnore,
  bbReport,
  bbScan,
  beetsInbox,
  genreApply,
  genreCleanup,
  genreIgnore,
  importInbox,
  libraryFixes,
  libraryStatus,
  rescanLibrary,
  runJob,
  type BatchResult,
  type BBFinding,
  type GenreIssue,
} from '~/tagging/api';
import { checkGenre, patchRows, refreshRakkiSoon, refreshTagging, ROW_COLS, useGenrePool, useMrqUrl, useRows } from '~/tagging/data';
import { undoEdit, writeBatch } from '~/tagging/LibraryTab';
import { searchInTagging, useTagging } from '~/tagging/store';
import { queryClient } from '~/queries';
import { Reveal, partOf, useReveal, Bar } from '~/ui/reveal';
import { Check, Disc3, EyeOff, InboxIcon, Merge, Refresh, Search, ShieldCheck, Sparkles, Tags, Trash2, User } from '~/ui/icons';
import { confirmAction, toast } from '~/ui/overlays';

type Section = 'bb' | 'genres' | 'artists' | 'library' | 'downloads';

const SECTIONS: { id: Section; label: string; icon: typeof Check }[] = [
  { id: 'bb', label: 'Big Brother', icon: ShieldCheck },
  { id: 'genres', label: 'Genres', icon: Tags },
  { id: 'artists', label: 'Artists Filed Twice', icon: User },
  { id: 'library', label: 'Library Index', icon: Disc3 },
  { id: 'downloads', label: 'Downloads and Genres', icon: InboxIcon },
];

const ago = (ts: number) => {
  if (!ts) return 'never';
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts * 1000).toLocaleDateString();
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const errText = (e: unknown) => (e instanceof Error ? e.message : 'MRQ didn’t answer');

/** Pick songs in the Library table by their paths (relative to the library). */
function showInLibrary(paths: string[]) {
  useTagging.setState({ tab: 'library', focus: { paths, at: Date.now() } });
}

export function TidyUp() {
  const url = useMrqUrl();
  const [section, setSection] = useState<Section>('bb');
  // The counts beside each section (each section asks again for its own details).
  const bb = useQuery({ queryKey: ['mrq', url, 'bb'], queryFn: bbReport, refetchInterval: (q) => (q.state.data?.scanning ? 2000 : false) });
  const genres = useQuery({ queryKey: ['mrq', url, 'genre-cleanup'], queryFn: () => genreCleanup() });
  const dupes = useQuery({ queryKey: ['mrq', url, 'artist-dupes'], queryFn: artistDupes });
  const counts: Partial<Record<Section, number>> = {
    bb: bb.data?.findings.filter((f) => !f.ignored).length,
    genres: genres.data?.length,
    artists: dupes.data?.length,
  };

  return (
    <div className="tg-split">
      <nav className="tg-list" aria-label="Tidy Up">
        <div className="tg-list-rows">
          {SECTIONS.map((s) => (
            <button key={s.id} className={`tg-group tg-section${section === s.id ? ' on' : ''}`} onClick={() => setSection(s.id)} aria-current={section === s.id}>
              <s.icon size={18} />
              <span className="tg-group-name">{s.label}</span>
              {counts[s.id] ? <span className="tg-count">{counts[s.id]}</span> : null}
            </button>
          ))}
        </div>
      </nav>
      <section className="tg-main tg-tidy" aria-label={SECTIONS.find((s) => s.id === section)?.label}>
        {section === 'bb' ? <BigBrother /> : section === 'genres' ? <Genres /> : section === 'artists' ? <Artists /> : section === 'library' ? <LibraryIndex /> : <Downloads />}
      </section>
    </div>
  );
}

function Head({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <header className="tg-tidy-head">
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {children ? <div className="tg-flex">{children}</div> : null}
    </header>
  );
}

function SkeletonCards({ n = 3 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="tg-tidy-card skel-card">
          <Bar width={`${40 + ((i * 17) % 30)}%`} />
          <Bar width={`${60 + ((i * 11) % 25)}%`} />
        </div>
      ))}
    </>
  );
}

// ---- Big Brother ----

function BigBrother() {
  const url = useMrqUrl();
  const q = useQuery({ queryKey: ['mrq', url, 'bb'], queryFn: bbReport, refetchInterval: (x) => (x.state.data?.scanning ? 2000 : false) });
  const r = q.data;
  const [showIgnored, setShowIgnored] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [head, body] = useReveal([partOf(r, { failed: q.isError }), partOf(r?.findings, { failed: q.isError })]);

  const run = async (key: string, started: Promise<{ job: string }>, desc: string) => {
    setBusy(key);
    try {
      const job = await runJob<{ history?: string } & Partial<BatchResult>>(started, desc);
      const failed = job.errors.filter((e) => e.p);
      const hist = job.result?.history;
      toast(failed.length ? `${desc}: ${failed.length} failed (${failed[0].error})` : `${desc}: done`, hist ? { label: 'Undo', run: () => void undoEdit(hist) } : undefined);
      if (job.result?.rows) patchRows('L', ROW_COLS, job.result.rows);
      refreshTagging('library');
      refreshRakkiSoon();
    } catch (e) {
      toast(`${desc}: ${errText(e)}`);
    } finally {
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: ['mrq', url, 'bb'] });
    }
  };

  const scan = () => run('scan', bbScan(), 'Big Brother scan');
  const fix = async (f: BBFinding, id: string, label: string, confirm?: string) => {
    if (confirm && !(await confirmAction(label, confirm, label))) return;
    await run(f.id, bbFix(f.id, id), label);
  };
  const fixAll = async (check: string, title: string, n: number) => {
    if (!(await confirmAction(`Fix All ${n}?`, `Uses the first fix on every “${title}” finding. Retags can be undone from History.`, `Fix ${n}`))) return;
    await run(`all:${check}`, bbFixAll(check), `Fixed “${title}”`);
  };
  const ignore = async (f: BBFinding) => {
    try {
      await bbIgnore(f.id, !f.ignored);
      void q.refetch();
    } catch (e) {
      toast(errText(e));
    }
  };

  const groups = useMemo(() => {
    const out = new Map<string, BBFinding[]>();
    for (const f of r?.findings ?? []) if (showIgnored || !f.ignored) out.set(f.check, [...(out.get(f.check) ?? []), f]);
    return out;
  }, [r, showIgnored]);
  const ignoredCount = r?.findings.filter((f) => f.ignored).length ?? 0;
  const scanning = !!r?.scanning || busy === 'scan';

  return (
    <div className="tg-tidy-page">
      <Reveal step={head} placeholder={<Head title="Big Brother" detail=" " />}>
        <Head
          title="Big Brother"
          detail={
            r?.error
              ? `The last scan stopped: ${r.error}`
              : `Checks the library for tags Jellyfin misreads, artists spelled several ways, and Jellyfin being out of date. Last scan ${ago(r?.ts ?? 0)}${r?.duration ? ` (${Math.round(r.duration)} s)` : ''}.`
          }
        >
          {ignoredCount ? (
            <button className="secondary small" onClick={() => setShowIgnored((v) => !v)}>
              {showIgnored ? 'Hide Ignored' : `Show ${ignoredCount} Ignored`}
            </button>
          ) : null}
          <button className="primary small" onClick={() => void scan()} disabled={scanning}>
            <Refresh size={16} /> {scanning ? 'Scanning…' : 'Scan Now'}
          </button>
        </Head>
      </Reveal>
      <Reveal step={body} placeholder={<SkeletonCards />}>
        <div className="tg-bb-checks">
          {(r?.checks ?? []).map((c) => {
            const s = r?.summary[c.id];
            const n = groups.get(c.id)?.length ?? 0;
            return (
              <span key={c.id} className={`tg-badge${s?.skipped ? ' off' : n ? ` ${c.severity}` : ' ok'}`} title={typeof s?.skipped === 'string' ? s.skipped : c.doc}>
                {s?.skipped ? null : n ? null : <Check size={13} />} {c.title}
                {n ? ` · ${n}` : ''}
              </span>
            );
          })}
        </div>
        {groups.size === 0 ? (
          <div className="tg-tidy-done">
            <ShieldCheck size={32} />
            <p>{r?.ts ? 'Nothing to fix. Big Brother found the library in order.' : 'No scan yet. Scan Now looks over the whole library (it takes a minute on a big one).'}</p>
          </div>
        ) : (
          [...groups].map(([check, list]) => {
            const c = r?.checks.find((x) => x.id === check);
            const open = list.filter((f) => !f.ignored && f.fixes.length);
            return (
              <section key={check} className="tg-tidy-group">
                <div className="tg-tidy-group-head">
                  <h3>
                    {c?.title ?? check} <span className="tg-count">{list.length}</span>
                  </h3>
                  {open.length > 1 ? (
                    <button className="secondary small" disabled={!!busy} onClick={() => void fixAll(check, c?.title ?? check, open.length)}>
                      Fix All {open.length}
                    </button>
                  ) : null}
                </div>
                {c?.doc ? <p className="tg-hint">{c.doc}</p> : null}
                {list.map((f) => (
                  <article key={f.id} className={`tg-tidy-card${f.ignored ? ' ignored' : ''}${busy === f.id ? ' busy' : ''}`}>
                    <div className="tg-tidy-card-body">
                      <strong>{f.title}</strong>
                      {f.detail.slice(0, 6).map((d, i) => (
                        <span key={i} className="tg-tidy-detail">
                          {d}
                        </span>
                      ))}
                      {f.detail.length > 6 ? <span className="tg-tidy-detail">and {f.detail.length - 6} more</span> : null}
                    </div>
                    <div className="tg-card-actions">
                      {f.paths.length ? (
                        <button className="tg-linkbtn" onClick={() => showInLibrary(f.paths)}>
                          <Search size={14} /> Show {plural(f.paths.length, 'Song')}
                        </button>
                      ) : null}
                      <button className="tg-linkbtn" onClick={() => void ignore(f)}>
                        <EyeOff size={14} /> {f.ignored ? 'Stop Ignoring' : 'Ignore'}
                      </button>
                      {f.ignored
                        ? null
                        : f.fixes.map((x) => (
                            <button key={x.id} className="secondary small" disabled={!!busy} onClick={() => void fix(f, x.id, x.label, x.confirm)}>
                              {x.label}
                            </button>
                          ))}
                    </div>
                  </article>
                ))}
              </section>
            );
          })
        )}
      </Reveal>
    </div>
  );
}

// ---- Genres ----

const REASONS: Record<string, string> = { malformed: 'Several in One', duplicate: 'Spelled Two Ways', '<10 tracks': 'Rarely Used' };
const reasonLabel = (r: string) => REASONS[r] ?? (r.startsWith('<') ? 'Rarely Used' : r.replace(/^\w/, (c) => c.toUpperCase()));
const splitGenre = (g: string) =>
  g
    .split(/\s*[/;\\]+\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

function Genres() {
  const url = useMrqUrl();
  const q = useQuery({ queryKey: ['mrq', url, 'genre-cleanup'], queryFn: () => genreCleanup() });
  const fixes = useQuery({ queryKey: ['mrq', url, 'library-fixes'], queryFn: libraryFixes });
  const lib = useRows('L');
  const pool = useGenrePool();
  const [filter, setFilter] = useState<'all' | 'malformed' | 'duplicate' | 'rare'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [head, body] = useReveal([partOf(q.data, { failed: q.isError }), partOf(q.data, { failed: q.isError })]);

  const list = (q.data ?? []).filter((g) =>
    filter === 'all' ? true : filter === 'malformed' ? g.reasons.includes('malformed') : filter === 'duplicate' ? !!g.suggested || g.reasons.some((r) => r.includes('dup')) : g.reasons.some((r) => r.startsWith('<')),
  );
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['mrq', url, 'genre-cleanup'] });
    void queryClient.invalidateQueries({ queryKey: ['mrq', url, 'genre-pool'] });
    void queryClient.invalidateQueries({ queryKey: ['mrq', url, 'library-fixes'] });
  };

  const apply = async (g: GenreIssue, target: string) => {
    const t = target.trim();
    const what = t ? `Merge “${g.genre}” into “${t}”` : `Remove “${g.genre}”`;
    if (!(await confirmAction(`${what}?`, `${t ? 'Renames' : 'Takes'} it ${t ? 'on' : 'off'} ${plural(g.count, 'song')} in the library. You can undo it from History.`, t ? 'Merge' : 'Remove'))) return;
    setBusy(g.genre);
    try {
      const started = await genreApply(g.genre, t);
      const job = await runJob<BatchResult>(started, what);
      patchRows('L', ROW_COLS, job.result?.rows);
      const hist = job.result?.history;
      toast(`${what}: ${plural(job.result?.changed ?? started.count, 'song')} changed`, hist ? { label: 'Undo', run: () => void undoEdit(hist, 'L') } : undefined);
      refreshTagging('library');
      refreshRakkiSoon();
    } catch (e) {
      toast(`${what}: ${errText(e)}`);
    } finally {
      setBusy(null);
      done();
    }
  };

  // "Pop Rap/Hip Hop" → Pop Rap and Hip Hop, as separate genres on every song that has it.
  const split = async (g: GenreIssue) => {
    const parts = splitGenre(g.genre);
    const paths = (lib.data?.rows ?? []).filter((r) => r.genre.includes(g.genre)).map((r) => r.p);
    if (!paths.length) return toast('The library list is still loading. Try again in a moment.');
    setBusy(g.genre);
    await writeBatch({ src: 'L', items: paths.map((p) => ({ p })), lists: { genre: { remove: [g.genre], add: parts } }, desc: `Split genre “${g.genre}”` });
    setBusy(null);
    done();
  };

  const ignore = async (g: GenreIssue) => {
    try {
      await genreIgnore(g.genre);
      toast(`“${g.genre}” won’t be flagged again`);
      done();
    } catch (e) {
      toast(errText(e));
    }
  };

  return (
    <div className="tg-tidy-page">
      <Reveal step={head} placeholder={<Head title="Genres" detail=" " />}>
        <Head title="Genres" detail="Genres spelled two ways, several genres stuck in one value, and genres on very few songs (often typos). Merge one into another, split it, take it off, or mark it fine.">
          <select className="field sm select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Show">
            <option value="all">All ({q.data?.length ?? 0})</option>
            <option value="duplicate">Spelled Two Ways</option>
            <option value="malformed">Several in One</option>
            <option value="rare">Rarely Used</option>
          </select>
          <button className="secondary small" onClick={() => void genreCleanup(true).then(() => done())}>
            <Refresh size={16} /> Check Again
          </button>
        </Head>
      </Reveal>
      <Reveal step={body} placeholder={<SkeletonCards n={6} />}>
        {fixes.data?.length ? (
          <div className="tg-banner">
            <span>
              {plural(
                fixes.data.reduce((n, f) => n + f.count, 0),
                'song',
              )}{' '}
              by {plural(fixes.data.length, 'artist')} still have genres written the old way (joined with / or ;), which Jellyfin reads as one genre.
            </span>
            <button className="secondary small" onClick={() => searchInTagging('malformed:genre')}>
              Show in Library
            </button>
          </div>
        ) : null}
        {list.length === 0 ? (
          <div className="tg-tidy-done">
            <Check size={32} />
            <p>No genres need a look.</p>
          </div>
        ) : (
          <div className="tg-genre-rows">
            {list.map((g) => {
              const malformed = g.reasons.includes('malformed');
              const target = targets[g.genre] ?? g.suggested;
              const hint = target ? checkGenre(target, pool.data?.genres) : null;
              return (
                <div key={g.genre} className={`tg-genre-row${busy === g.genre ? ' busy' : ''}`}>
                  <div className="tg-genre-name">
                    <strong>{g.genre}</strong>
                    <span className="tg-hint">
                      {plural(g.count, 'song')} · {g.reasons.map(reasonLabel).join(', ')}
                    </span>
                  </div>
                  <div className="tg-genre-merge">
                    <input
                      className={`field sm${hint && hint.kind === 'new' ? ' warn' : ''}`}
                      list="tg-genre-pool"
                      value={target}
                      placeholder={malformed ? splitGenre(g.genre).join(', ') : 'Merge Into…'}
                      onChange={(e) => setTargets((t) => ({ ...t, [g.genre]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && target.trim() && void apply(g, target)}
                      aria-label={`Merge ${g.genre} into`}
                      spellCheck={false}
                    />
                    {target.trim() ? (
                      <button className="secondary small" disabled={!!busy} onClick={() => void apply(g, target)}>
                        <Merge size={15} /> Merge
                      </button>
                    ) : malformed ? (
                      <button className="secondary small" disabled={!!busy} onClick={() => void split(g)} title={`Becomes ${splitGenre(g.genre).join(' and ')}`}>
                        Split in {splitGenre(g.genre).length}
                      </button>
                    ) : null}
                  </div>
                  <div className="tg-flex">
                    <button className="tg-icon-btn" title="Show in Library" aria-label={`Show songs with ${g.genre}`} onClick={() => searchInTagging(`genre="${g.genre}"`)}>
                      <Search size={16} />
                    </button>
                    <button className="tg-icon-btn" title="It’s Fine" aria-label={`Mark ${g.genre} fine`} onClick={() => void ignore(g)}>
                      <Check size={16} />
                    </button>
                    <button className="tg-icon-btn danger" title="Remove From Every Song" aria-label={`Remove ${g.genre}`} disabled={!!busy} onClick={() => void apply(g, '')}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
            <datalist id="tg-genre-pool">
              {(pool.data?.genres ?? []).slice(0, 800).map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </div>
        )}
      </Reveal>
    </div>
  );
}

// ---- Artists filed twice ----

function Artists() {
  const url = useMrqUrl();
  const q = useQuery({ queryKey: ['mrq', url, 'artist-dupes'], queryFn: artistDupes });
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [head, body] = useReveal([partOf(q.data, { failed: q.isError }), partOf(q.data, { failed: q.isError })]);

  const merge = async (names: string[], target: string) => {
    const t = target.trim();
    if (!t) return;
    const ok = await confirmAction(
      `Merge Into “${t}”?`,
      `Moves every folder of ${names.filter((n) => n !== t).map((n) => `“${n}”`).join(', ')} into “${t}” and retags the songs. Jellyfin sees moved songs as new, so their play counts, likes and playlist spots start over. This can’t be undone from History.`,
      'Merge',
    );
    if (!ok) return;
    setBusy(names.join('|'));
    try {
      const r = await artistMerge(names, t);
      toast(`Merged into “${r.target}”: ${plural(r.retagged, 'song')} retagged`);
      refreshTagging('library');
      refreshRakkiSoon();
    } catch (e) {
      toast(`Couldn’t merge: ${errText(e)}`);
    } finally {
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: ['mrq', url, 'artist-dupes'] });
    }
  };

  return (
    <div className="tg-tidy-page">
      <Reveal step={head} placeholder={<Head title="Artists Filed Twice" detail=" " />}>
        <Head title="Artists Filed Twice" detail="The same artist in two folders because of a different spelling or capital letter. Merging moves the folders together and fixes the tags. To only fix tags (and keep plays), use a Big Brother “several spellings” fix instead." />
      </Reveal>
      <Reveal step={body} placeholder={<SkeletonCards />}>
        {!q.data?.length ? (
          <div className="tg-tidy-done">
            <Check size={32} />
            <p>Every artist has one folder.</p>
          </div>
        ) : (
          q.data.map((d) => {
            const key = d.names.join('|');
            const target = targets[key] ?? d.suggested;
            return (
              <article key={key} className={`tg-tidy-card${busy === key ? ' busy' : ''}`}>
                <div className="tg-tidy-card-body">
                  <div className="tg-flex">
                    {d.names.map((n) => (
                      <button key={n} className={`chip${n === target ? ' on' : ''}`} onClick={() => setTargets((t) => ({ ...t, [key]: n }))} title={`Use “${n}”`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="tg-card-actions">
                  <button className="tg-linkbtn" onClick={() => searchInTagging(d.names.map((n) => `artist="${n}"`).join(' '))} title="Show their songs">
                    <Search size={14} /> Show Songs
                  </button>
                  <input className="field sm" value={target} onChange={(e) => setTargets((t) => ({ ...t, [key]: e.target.value }))} aria-label="Merge into" spellCheck={false} />
                  <button className="secondary small" disabled={!!busy || !target.trim()} onClick={() => void merge(d.names, target)}>
                    <Merge size={15} /> Merge
                  </button>
                </div>
              </article>
            );
          })
        )}
      </Reveal>
    </div>
  );
}

// ---- Library index ----

function LibraryIndex() {
  const url = useMrqUrl();
  const q = useQuery({ queryKey: ['mrq', url, 'library-status'], queryFn: libraryStatus, refetchInterval: (x) => (x.state.data?.scanning ? 1500 : 30_000) });
  const s = q.data;
  const [head] = useReveal([partOf(s, { failed: q.isError })]);
  // A scan that just finished: the Library table asks for the new list.
  const scanning = !!s?.scanning;
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !scanning) refreshTagging('library');
    was.current = scanning;
  }, [scanning]);

  const rescan = async (full: boolean) => {
    try {
      await rescanLibrary(full);
      void q.refetch();
    } catch (e) {
      toast(errText(e));
    }
  };

  return (
    <div className="tg-tidy-page">
      <Reveal step={head} placeholder={<SkeletonCards n={1} />}>
        <Head title="Library Index" detail="MRQ keeps a list of every song file and its tags, so the Library table, Genres and Big Brother open instantly. It notices changed files on its own; rescan after editing files outside Rakki and MRQ.">
          <button className="secondary small" disabled={s?.scanning} onClick={() => void rescan(true)}>
            Read Every File Again
          </button>
          <button className="primary small" disabled={s?.scanning} onClick={() => void rescan(false)}>
            <Refresh size={16} /> Rescan
          </button>
        </Head>
        {s ? (
          <div className="tg-facts tg-tidy-facts">
            <span>Songs</span>
            <strong>{s.count.toLocaleString()}</strong>
            <span>Last Scan</span>
            <strong>{s.scanning ? 'Scanning now' : ago(s.ts)}</strong>
            {s.changed || s.removed ? (
              <>
                <span>Last Changes</span>
                <strong>
                  {plural(s.changed, 'file')} changed, {plural(s.removed, 'file')} gone
                </strong>
              </>
            ) : null}
            {s.error ? (
              <>
                <span>Problem</span>
                <strong className="tg-warn-text">{s.error}</strong>
              </>
            ) : null}
          </div>
        ) : null}
        {s?.scanning ? <Progress label={s.phase || 'Reading files'} done={s.done} total={s.total} /> : null}
      </Reveal>
    </div>
  );
}

function Progress({ label, done, total, children }: { label: string; done: number; total: number; children?: ReactNode }) {
  return (
    <div className="tg-progress">
      <div className="tg-progress-text">
        <span>{label}</span>
        <span>{total ? `${done.toLocaleString()} of ${total.toLocaleString()}` : ''}</span>
        {children}
      </div>
      <div className="tg-progress-bar">
        <i style={{ width: total ? `${Math.min(100, (done / total) * 100)}%` : '30%' }} className={total ? '' : 'indeterminate'} />
      </div>
    </div>
  );
}

// ---- Downloads (beets' inbox) and auto-genre ----

function Downloads() {
  const url = useMrqUrl();
  const inbox = useQuery({ queryKey: ['mrq', url, 'beets-inbox'], queryFn: beetsInbox, refetchInterval: 20_000 });
  const ag = useQuery({ queryKey: ['mrq', url, 'auto-genre'], queryFn: autoGenreStatus, refetchInterval: (x) => (x.state.data?.running ? 1500 : false) });
  const [overwrite, setOverwrite] = useState(false);
  const [head, body] = useReveal([partOf(inbox.data, { failed: inbox.isError }), partOf(ag.data, { failed: ag.isError })]);
  const b = inbox.data;
  const a = ag.data;
  const running = !!a?.running;
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !running) refreshTagging('queue');
    was.current = running;
  }, [running]);

  const bringIn = async () => {
    try {
      const r = await importInbox();
      toast(`Asked beets to bring in ${plural(r.tracks, 'song')}. They show up in the Inbox once tagged.`);
      void inbox.refetch();
    } catch (e) {
      toast(`Couldn’t start the import: ${errText(e)}`);
    }
  };
  const startAg = async () => {
    try {
      await autoGenreStart(overwrite);
      void ag.refetch();
    } catch (e) {
      toast(errText(e));
    }
  };
  const count = (x: unknown) => (Array.isArray(x) ? x.length : typeof x === 'number' ? x : 0);

  return (
    <div className="tg-tidy-page">
      <Reveal step={head} placeholder={<SkeletonCards n={1} />}>
        <Head title="Downloads Folder" detail="New downloads land here first. Beets tags them and moves them into the Inbox; bring them in now instead of waiting for its next run.">
          <button className="primary small" disabled={!b?.ok || !(b.folders.length || b.loose)} onClick={() => void bringIn()}>
            <InboxIcon size={16} /> Bring In Now
          </button>
        </Head>
        {!b?.ok ? (
          <p className="tg-hint">MRQ can’t see a downloads folder{b?.path ? ` at ${b.path}` : ''}.</p>
        ) : b.folders.length || b.loose ? (
          <div className="tg-tidy-list">
            {b.pending ? <p className="tg-hint">An import is already on its way.</p> : null}
            {b.folders.map((f) => (
              <div key={f.name} className="tg-tidy-line">
                <span>{f.name}</span>
                <span className="tg-hint">{plural(f.tracks, 'song')}</span>
              </div>
            ))}
            {b.loose ? (
              <div className="tg-tidy-line">
                <span>Loose files</span>
                <span className="tg-hint">{plural(b.loose, 'song')}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="tg-hint">Nothing waiting in the downloads folder.</p>
        )}
      </Reveal>
      <Reveal step={body} placeholder={<SkeletonCards n={1} />}>
        <Head title="Fill In Genres" detail="Looks up genres for every artist waiting in the Inbox (RateYourMusic, then Last.fm and MusicBrainz) and writes them in, so sending is quicker.">
          <label className="tg-check">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} disabled={a?.running} /> Replace Genres Already There
          </label>
          {a?.running ? (
            <button className="secondary small" onClick={() => void autoGenreCancel().then(() => ag.refetch())}>
              Stop
            </button>
          ) : (
            <button className="primary small" onClick={() => void startAg()}>
              <Sparkles size={16} /> Fill In Genres
            </button>
          )}
        </Head>
        {a?.running ? <Progress label={a.current ? `Looking up ${a.current}` : 'Starting'} done={a.done} total={a.total} /> : null}
        {a && !a.running && a.total ? (
          <p className="tg-hint">
            Last run: genres for {plural(a.filled, 'artist')} ({plural(a.tracks, 'song')}), {a.skipped} skipped, {count(a.notfound)} not found
            {count(a.errors) ? `, ${count(a.errors)} errors` : ''}.
          </p>
        ) : null}
      </Reveal>
    </div>
  );
}
