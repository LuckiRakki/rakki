// Tagging → Library: every song file in your library as one big table, with a tag panel for the
// songs you pick, the MP3Tag way (MRQ's Tag Editor). Edits are written to the files in place, so
// Jellyfin keeps plays, likes and playlists, and every save can be undone (History, or the toast).
// - Click, Shift-click and Ctrl-click pick songs; ↑ ↓ move, Shift extends, Ctrl+A picks all shown,
//   Esc clears, Space listens. Double-click a cell (or F2) to change just that one.
// - The search takes MRQ's syntax (genre:rap year>=2020 missing:spotify…), and Problems has the
//   usual ones ready.
// - The panel: a field the songs share can be changed; one they differ on says "Keep" and is left
//   alone unless you type in it. Genres work as a set: add to all, take off all.
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';

import { spotifyId, spotifyLink } from '~/mrq/client';
import { kv } from '~/lib/kv';
import {
  artUrl,
  batch,
  getHistory,
  libraryTid,
  rawTags,
  RELEASE_TYPES,
  runJob,
  setArtMany,
  toV24,
  undo,
  type BatchBody,
  type BatchResult,
  type Row,
  type Src,
  type TagField,
  type TagSet,
} from '~/tagging/api';
import { autoNumber, changeCase, cleanUp, findReplace, splitFeat, type Changes } from '~/tagging/actions';
import { Chips } from '~/tagging/Chips';
import { CoverBox, type PickedArt } from '~/tagging/Cover';
import { checkGenre, fmtLength, patchRows, refreshRakkiSoon, refreshTagging, ROW_COLS, useGenrePool, useRows } from '~/tagging/data';
import { autoFillDialog, spotifyLinksDialog, type FillChanges } from '~/tagging/dialogs';
import { togglePreview, usePreview } from '~/tagging/preview';
import { parseQuery, SMART } from '~/tagging/query';
import { useTagging } from '~/tagging/store';
import { Check, ChevronDown, Copy, Disc3, Info, ListMusic, Music2, Play, Refresh, Scissors, Search, SlidersHorizontal, Sparkles, TextSize, Undo, X } from '~/ui/icons';
import { closeDialog, confirmAction, openMenu, showDialog, toast } from '~/ui/overlays';
import { Empty } from '~/ui/states';

// ---- Writing, with Undo ----

/** Write a batch, put the new rows in place, and offer Undo. Resolves once it's written. */
export async function writeBatch(body: BatchBody): Promise<boolean> {
  try {
    const job = await runJob<BatchResult>(batch(body), body.desc);
    const r = job.result;
    patchRows(body.src, ROW_COLS, r?.rows);
    refreshTagging(body.src === 'L' ? 'library' : 'queue');
    refreshRakkiSoon();
    const failed = job.errors.filter((e) => e.p);
    const n = r?.changed ?? 0;
    const text = failed.length ? `Changed ${n}, ${failed.length} failed: ${failed[0].error}` : n ? `Changed ${n} ${n === 1 ? 'file' : 'files'}` : 'Nothing needed changing';
    toast(text, r?.history ? { label: 'Undo', run: () => void undoEdit(r.history, body.src) } : undefined);
    return true;
  } catch (e) {
    toast(`Couldn’t save: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
    return false;
  }
}

export async function undoEdit(id: string, src?: Src) {
  try {
    const job = await runJob<{ restored: number; conflicts: unknown[]; rows: unknown[][]; src: Src; video?: boolean }>(undo(id), 'Undoing');
    const r = job.result;
    if (r && !r.video) patchRows(r.src ?? src ?? 'L', ROW_COLS, r.rows);
    refreshTagging('all');
    refreshRakkiSoon();
    toast(r?.conflicts?.length ? `Undone, except ${r.conflicts.length} values changed again since` : 'Undone');
  } catch (e) {
    toast(`Couldn’t undo: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
  }
}

const applyChanges = (src: Src, desc: string) => (c: Changes) =>
  void writeBatch({ src, items: [...c].map(([p, set]) => ({ p, set })), desc });

// ---- Columns ----

type Col = 'title' | 'artist' | 'album' | 'albumartist' | 'date' | 'tracknumber' | 'discnumber' | 'genre' | 'releasetype' | 'composer' | 'spotifyid' | 'ext' | 'length';

const COLS: { key: Col; label: string; w: string; edit?: boolean; list?: boolean; optional?: boolean }[] = [
  { key: 'title', label: 'Title', w: 'minmax(90px, 2fr)', edit: true },
  { key: 'artist', label: 'Artists', w: 'minmax(60px, 1.4fr)', edit: true, list: true },
  { key: 'album', label: 'Album', w: 'minmax(60px, 1.4fr)', edit: true },
  { key: 'albumartist', label: 'Album Artist', w: 'minmax(60px, 1fr)', edit: true, list: true, optional: true },
  { key: 'date', label: 'Year', w: '52px', edit: true },
  { key: 'tracknumber', label: '#', w: '44px', edit: true },
  { key: 'discnumber', label: 'Disc', w: '44px', edit: true, optional: true },
  { key: 'genre', label: 'Genres', w: 'minmax(60px, 1.4fr)', edit: true, list: true },
  { key: 'releasetype', label: 'Type', w: '72px', edit: true, optional: true },
  { key: 'composer', label: 'Composer', w: 'minmax(70px, 1fr)', edit: true, optional: true },
  { key: 'spotifyid', label: 'Spotify', w: '58px', optional: true },
  { key: 'length', label: 'Time', w: '56px', optional: true },
  { key: 'ext', label: 'Format', w: '56px', optional: true },
];

const COLS_KEY = 'rakki.tagging.columns';
const DEFAULT_HIDDEN: Col[] = ['composer', 'length', 'releasetype', 'ext'];

function useColumns() {
  const [hidden, setHidden] = useState<Col[]>(() => {
    try {
      return JSON.parse(kv.getItem(COLS_KEY) ?? 'null') ?? DEFAULT_HIDDEN;
    } catch {
      return DEFAULT_HIDDEN;
    }
  });
  const toggle = (c: Col) => {
    const next = hidden.includes(c) ? hidden.filter((x) => x !== c) : [...hidden, c];
    setHidden(next);
    kv.setItem(COLS_KEY, JSON.stringify(next));
  };
  return { cols: COLS.filter((c) => !hidden.includes(c.key)), hidden, toggle };
}

const cellText = (r: Row, c: Col): string => {
  switch (c) {
    case 'artist':
    case 'albumartist':
    case 'genre':
      return r[c].join(', ');
    case 'length':
      return fmtLength(r.length);
    case 'ext':
      return `${r.ext.toUpperCase()}${r.bitrate ? ` ${r.bitrate}` : ''}`;
    default:
      return String(r[c] ?? '');
  }
};

const sortValue = (r: Row, c: Col): string | number =>
  c === 'date' || c === 'tracknumber' || c === 'discnumber' ? parseInt(String(r[c]), 10) || 0 : c === 'length' ? r.length : cellText(r, c).toLowerCase();

// ---- The tab ----

const ROW_H = 36;

export function LibraryTab() {
  const [src, setSrc] = useState<Src>('L');
  const q = useRows(src);
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const [search, setSearch] = useState('');
  const settled = useDeferredValue(search);
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 } | null>(null);
  const { cols, hidden, toggle } = useColumns();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState(-1);
  const [cursor, setCursor] = useState(-1);
  const [editing, setEditing] = useState<{ p: string; col: Col } | null>(null);
  const [dirty, setDirty] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const focus = useTagging((s) => s.focus);

  const shown = useMemo(() => {
    const test = parseQuery(settled);
    const list = test ? rows.filter(test) : [...rows];
    if (sort) list.sort((a, b) => {
      const x = sortValue(a, sort.col);
      const y = sortValue(b, sort.col);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return list;
  }, [rows, settled, sort]);
  const index = useMemo(() => new Map(shown.map((r, i) => [r.p, i])), [shown]);
  // Songs filtered out drop out of the pick: the panel never edits songs you can't see.
  const selected = useMemo(() => shown.filter((r) => sel.has(r.p)), [shown, sel]);

  const v = useVirtualizer({ count: shown.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_H, overscan: 12 });

  // Open in Tagging: pick the songs another page sent, and show the first.
  const scrollTo = useRef<string[] | null>(null);
  useEffect(() => {
    if (!focus) return;
    if (src !== 'L') return setSrc('L');
    if (!rows.length) return;
    setSearch(focus.search ?? '');
    if (focus.paths.length) {
      setSel(new Set(focus.paths));
      scrollTo.current = focus.paths;
    }
    useTagging.setState({ focus: null });
  }, [focus, rows, src]);
  // …and scroll to the first of them once the table shows them.
  useEffect(() => {
    const want = scrollTo.current;
    if (!want) return;
    const at = want.map((p) => index.get(p)).filter((i): i is number => i !== undefined);
    if (!at.length) return;
    scrollTo.current = null;
    v.scrollToIndex(Math.min(...at), { align: 'center' });
  }, [index, v]);

  /** Change the pick, asking first when the panel has unsaved changes. */
  const pick = async (next: Set<string>) => {
    if (dirty && !(await confirmAction('Discard Your Changes?', 'The songs you picked have changes that aren’t saved yet.', 'Discard'))) return;
    setDirty(false);
    setSel(next);
  };

  const clickRow = (e: ReactMouseEvent, i: number) => {
    const p = shown[i].p;
    if (e.shiftKey && anchor >= 0) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      const next = e.ctrlKey || e.metaKey ? new Set(sel) : new Set<string>();
      for (let k = a; k <= b; k++) next.add(shown[k].p);
      void pick(next);
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(sel);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      void pick(next);
      setAnchor(i);
    } else {
      void pick(new Set([p]));
      setAnchor(i);
    }
    setCursor(i);
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    const move = (to: number) => {
      const i = Math.max(0, Math.min(shown.length - 1, to));
      setCursor(i);
      v.scrollToIndex(i);
      if (e.shiftKey && anchor >= 0) {
        const next = new Set<string>();
        for (let k = Math.min(anchor, i); k <= Math.max(anchor, i); k++) next.add(shown[k].p);
        void pick(next);
      } else {
        void pick(new Set([shown[i].p]));
        setAnchor(i);
      }
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(cursor + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      move(cursor + (e.key === 'PageDown' ? 15 : -15));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      void pick(new Set(shown.map((r) => r.p)));
    } else if (e.key === 'Escape' && sel.size) {
      void pick(new Set());
    } else if (e.key === ' ' && shown[cursor]) {
      e.preventDefault();
      togglePreview(libraryTid(shown[cursor].p));
    } else if ((e.key === 'F2' || e.key === 'Enter') && shown[cursor]) {
      e.preventDefault();
      setEditing({ p: shown[cursor].p, col: 'title' });
    }
  };

  // Ctrl+Z: undo the last edit, when you're not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      void getHistory().then((h) => {
        const last = h.find((x) => !x.undone && (x.src === 'L' || x.src === 'S'));
        if (last) void undoEdit(last.id);
        else toast('Nothing to undo');
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commitCell = (r: Row, col: Col, value: string) => {
    setEditing(null);
    const meta = COLS.find((c) => c.key === col);
    const next = meta?.list ? value.split(/\s*[,;]\s*|\s*\\+\s*/).map((x) => x.trim()).filter(Boolean) : value.trim();
    if (cellText(r, col) === (Array.isArray(next) ? next.join(', ') : next)) return;
    void writeBatch({ src, items: [{ p: r.p, set: { [col]: next } }], desc: `${meta?.label ?? col} → “${Array.isArray(next) ? next.join(', ') : next}” · 1 file` });
  };

  const menu = (e: ReactMouseEvent, i?: number) => {
    let list = selected;
    if (i !== undefined && !sel.has(shown[i].p)) {
      list = [shown[i]];
      setSel(new Set([shown[i].p]));
      setAnchor(i);
      setCursor(i);
    }
    if (!list.length) return;
    openMenu(e, actionItems(src, list), list.length === 1 ? list[0].title : `${list.length} Songs`);
  };

  const template = `26px ${cols.map((c) => c.w).join(' ')}`;
  const showCols = (e: ReactMouseEvent) =>
    openMenu(
      e,
      COLS.filter((c) => c.optional).map((c) => ({ label: `${hidden.includes(c.key) ? 'Show' : 'Hide'} ${c.label}`, icon: hidden.includes(c.key) ? Check : X, run: () => toggle(c.key) })),
      'Columns',
    );

  return (
    <div className="tg-split lib">
      <section className="tg-table-wrap" aria-label="Songs">
        <div className="tg-toolbar">
          <div className="filters" role="group" aria-label="Files">
            {(['L', 'S'] as Src[]).map((s) => (
              <button
                key={s}
                className={src === s ? 'on' : ''}
                aria-pressed={src === s}
                onClick={() => {
                  setSrc(s);
                  void pick(new Set());
                }}>
                {s === 'L' ? 'Library' : 'Inbox Files'}
              </button>
            ))}
          </div>
          <label className="tg-search">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search, or genre:rap year>=2020 missing:spotify…" aria-label="Search songs" spellCheck={false} />
            {search ? (
              <button className="tg-icon-btn" aria-label="Clear search" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            ) : null}
          </label>
          <button
            className="secondary small"
            onClick={(e) =>
              openMenu(
                e,
                SMART.map((s) => ({ label: s.label, icon: search === s.query ? Check : undefined, run: () => setSearch(s.query) })),
                'Problems',
              )
            }>
            Problems <ChevronDown size={14} />
          </button>
          <button className="tg-icon-btn" title="Columns" aria-label="Columns" onClick={showCols}>
            <SlidersHorizontal size={17} />
          </button>
          <span className="tg-flex" />
          <span className="muted small">
            {shown.length.toLocaleString()} {shown.length === 1 ? 'song' : 'songs'}
            {selected.length ? ` · ${selected.length.toLocaleString()} picked` : ''}
          </span>
          <button className="secondary small" disabled={!selected.length} onClick={(e) => menu(e)}>
            Actions <ChevronDown size={14} />
          </button>
        </div>
        <div className="tg-thead" style={{ gridTemplateColumns: template }} role="row">
          <span />
          {cols.map((c) => (
            <button
              key={c.key}
              role="columnheader"
              aria-sort={sort?.col === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
              className={sort?.col === c.key ? 'on' : ''}
              onClick={() => setSort((s) => (s?.col === c.key ? (s.dir === 1 ? { col: c.key, dir: -1 } : null) : { col: c.key, dir: 1 }))}>
              {c.label}
              {sort?.col === c.key ? <ChevronDown size={12} className={sort.dir === -1 ? 'flip' : ''} /> : null}
            </button>
          ))}
        </div>
        <div ref={scroller} className="tg-tbody" tabIndex={0} onKeyDown={onKey} aria-label="Songs" role="grid" aria-multiselectable>
          {q.isError ? (
            <Empty icon={Disc3} title="Couldn’t Load the Files" detail={q.error instanceof Error ? q.error.message : ''} action={{ label: 'Try Again', run: () => void q.refetch() }} />
          ) : !q.data ? (
            Array.from({ length: 14 }, (_, i) => (
              <div key={i} className="tg-row skel-row" style={{ gridTemplateColumns: template }}>
                <span className="tg-thumb sm skel" />
                {cols.map((c) => (
                  <span key={c.key} className="skel-line" />
                ))}
              </div>
            ))
          ) : !shown.length ? (
            <Empty icon={Search} title={rows.length ? 'No Songs Match' : 'No Files Yet'} detail={rows.length ? 'Try fewer words, or clear the search.' : src === 'L' ? 'MRQ is still reading your library. Try again in a moment.' : 'Nothing is waiting in the inbox.'} />
          ) : (
            <div ref={table} style={{ height: v.getTotalSize(), position: 'relative' }}>
              {v.getVirtualItems().map((it) => {
                const r = shown[it.index];
                const on = sel.has(r.p);
                return (
                  <div
                    key={r.p}
                    role="row"
                    aria-selected={on}
                    className={`tg-row${on ? ' on' : ''}${it.index === cursor ? ' cursor' : ''}${r.error ? ' broken' : ''}`}
                    style={{ gridTemplateColumns: template, transform: `translateY(${it.start}px)` }}
                    onMouseDown={(e) => e.button === 0 && !(e.target as HTMLElement).closest('input') && clickRow(e, it.index)}
                    onContextMenu={(e) => menu(e, it.index)}
                    title={r.error || undefined}>
                    <RowArt r={r} />
                    {cols.map((c) =>
                      editing?.p === r.p && editing.col === c.key ? (
                        <CellEditor key={c.key} r={r} col={c.key} onDone={(val) => (val === null ? setEditing(null) : commitCell(r, c.key, val))} />
                      ) : (
                        <span key={c.key} className={`tg-cell-text${c.key === 'genre' ? ' genres' : ''}`} onDoubleClick={() => c.edit && setEditing({ p: r.p, col: c.key })}>
                          {c.key === 'spotifyid' ? r.spotifyid ? <Check size={14} /> : null : c.key === 'genre' ? <GenreCell genres={r.genre} /> : cellText(r, c.key)}
                        </span>
                      ),
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      <aside className="tg-panel" aria-label="Tags">
        {selected.length ? (
          <TagPanel key={selected.map((r) => r.p).join('\n')} src={src} rows={selected} onDirty={setDirty} />
        ) : (
          <div className="tg-panel-empty">
            <Music2 size={28} />
            <p>Pick songs to see and change their tags.</p>
            <p className="muted small">Shift-click picks a range, Ctrl-click adds one. Right-click for actions.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function RowArt({ r }: { r: Row }) {
  const tid = libraryTid(r.p);
  const playing = usePreview((s) => s.tid === tid && s.playing);
  return (
    <span className="tg-row-art">
      {r.art ? <img src={artUrl(tid, r.mt, 64)} alt="" loading="lazy" draggable={false} /> : <span className="tg-thumb sm empty" />}
      <button
        className={`tg-row-play${playing ? ' on' : ''}`}
        aria-label={playing ? `Pause ${r.title}` : `Listen to ${r.title}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => togglePreview(tid)}>
        {playing ? <span className="tg-eq" /> : <Play size={14} />}
      </button>
    </span>
  );
}

function GenreCell({ genres }: { genres: string[] }) {
  const pool = useGenrePool().data?.genres;
  return (
    <>
      {genres.map((g, i) => {
        const c = checkGenre(g, pool).kind;
        return (
          <span key={i} className={c === 'ok' ? '' : `tg-g-${c}`}>
            {i ? ', ' : ''}
            {g}
          </span>
        );
      })}
    </>
  );
}

function CellEditor({ r, col, onDone }: { r: Row; col: Col; onDone(v: string | null): void }) {
  const [v, setV] = useState(cellText(r, col));
  const done = useRef(false);
  const finish = (val: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(val);
  };
  return (
    <input
      className="tg-cell-edit"
      value={v}
      autoFocus
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(v);
        else if (e.key === 'Escape') finish(null);
      }}
    />
  );
}

// ---- Actions on picked songs (the Actions button and right-click) ----

function actionItems(src: Src, list: Row[]) {
  const old = list.filter((r) => r.ext === 'mp3' && r.id3 && r.id3 !== '2.4');
  const desc = (what: string) => `${what} · ${list.length} ${list.length === 1 ? 'file' : 'files'}`;
  return [
    { label: 'Auto-Fill From iTunes and MusicBrainz', icon: Sparkles, run: () => libraryAutoFill(src, list) },
    {
      label: 'Spotify Links From an Album',
      icon: Search,
      run: () =>
        spotifyLinksDialog(
          list.map((r) => ({ key: r.p, title: r.title, n: parseInt(r.tracknumber, 10) || 0, length: r.length, has: r.spotifyid })),
          (ids, link) => void writeBatch({ src, items: [...ids].map(([p, id]) => ({ p, set: { spotifyid: id } })), desc: `Spotify links from ${link.slice(0, 60)} · ${ids.size} files` }),
        ),
    },
    { label: 'Auto-Number', icon: ListMusic, divider: true, run: () => autoNumber(list, applyChanges(src, desc('Auto-number'))) },
    { label: 'Find and Replace', icon: Search, run: () => findReplace(list, (c, d) => applyChanges(src, d)(c)) },
    { label: 'Change Case', icon: TextSize, run: () => changeCase(list, (c, d) => applyChanges(src, d)(c)) },
    { label: 'Clean Up Text', icon: Sparkles, run: () => cleanUp(list, (c, d) => applyChanges(src, d)(c)) },
    { label: 'Split feat. Out of Titles', icon: Scissors, run: () => splitFeat(list, (c, d) => applyChanges(src, d)(c)) },
    ...(old.length
      ? [
          {
            label: `Convert ${old.length} to ID3v2.4`,
            icon: Refresh,
            divider: true,
            run: () =>
              void runJob<{ converted: number; rows: unknown[][] }>(toV24(src, old.map((r) => r.p)), `Converting ${old.length} files`)
                .then((j) => {
                  patchRows(src, ROW_COLS, j.result?.rows);
                  toast(`Converted ${j.result?.converted ?? 0} ${j.result?.converted === 1 ? 'file' : 'files'}. Jellyfin now sees every artist and genre`);
                })
                .catch((e: unknown) => toast(`Couldn’t convert: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`)),
          },
        ]
      : []),
    { label: list.length === 1 ? 'Listen' : 'Listen to the First', icon: Play, divider: !old.length, run: () => togglePreview(libraryTid(list[0].p)) },
    {
      label: list.length === 1 ? 'Copy File Path' : 'Copy File Paths',
      icon: Copy,
      run: () => void navigator.clipboard?.writeText(list.map((r) => r.p).join('\n')).then(() => toast(list.length === 1 ? 'Path copied' : `${list.length} paths copied`)),
    },
  ];
}

function libraryAutoFill(src: Src, list: Row[]) {
  if (list.length > 400) return toast('Pick 400 songs or fewer to look up at once');
  autoFillDialog(
    list.map((r) => ({
      key: r.p,
      artist: r.artist[0] ?? r.albumartist[0] ?? '',
      title: r.title,
      album: r.album,
      length: r.length,
      coverPx: r.art ? Math.min(r.aw, r.ah) : 0,
      now: { date: r.date, tracknumber: r.tracknumber, discnumber: r.discnumber, album: r.album, albumartist: r.albumartist.join(', '), releasetype: r.releasetype, genre: r.genre.join(', ') },
    })),
    (changes: FillChanges) => {
      const items = [...changes].filter(([, c]) => Object.keys(c.set).length).map(([p, c]) => ({ p, set: c.set as TagSet }));
      void (async () => {
        if (items.length) await writeBatch({ src, items, desc: `Auto-fill · ${items.length} files` });
        // Covers: one job per picture (songs of one album share one).
        const covers = new Map<string, string[]>();
        for (const [p, c] of changes) if (c.cover) covers.set(c.cover, [...(covers.get(c.cover) ?? []), p]);
        for (const [url, paths] of covers) {
          const j = await runJob<{ rows: unknown[][] }>(setArtMany(src, paths, { url }), 'Writing covers').catch(() => null);
          patchRows(src, ROW_COLS, j?.result?.rows);
        }
        if (covers.size) toast(`Covers written to ${[...covers.values()].flat().length} files`);
      })();
    },
    'library',
  );
}

// ---- The tag panel ----

type Scalar = 'title' | 'album' | 'date' | 'tracknumber' | 'discnumber' | 'composer' | 'releasetype';

const SCALARS: { key: Scalar; label: string; single?: boolean; narrow?: boolean }[] = [
  { key: 'title', label: 'Title', single: true },
  { key: 'album', label: 'Album' },
  { key: 'date', label: 'Year', narrow: true },
  { key: 'tracknumber', label: 'Track', narrow: true },
  { key: 'discnumber', label: 'Disc', narrow: true },
  { key: 'releasetype', label: 'Type', narrow: true },
  { key: 'composer', label: 'Composer' },
];

const sharedOf = <T,>(rows: Row[], get: (r: Row) => T, key: (v: T) => string = (v) => JSON.stringify(v)): { value: T | null; count: number } => {
  const seen = new Map<string, T>();
  for (const r of rows) seen.set(key(get(r)), get(r));
  return { value: seen.size === 1 ? [...seen.values()][0] : null, count: seen.size };
};

function TagPanel({ src, rows, onDirty }: { src: Src; rows: Row[]; onDirty(d: boolean): void }) {
  const one = rows.length === 1 ? rows[0] : null;
  const [typed, setTyped] = useState<Partial<Record<Scalar, string>>>({});
  const [lists, setLists] = useState<Partial<Record<'artist' | 'albumartist', string[]>>>({});
  const [genreAdd, setGenreAdd] = useState<string[]>([]);
  const [genreRemove, setGenreRemove] = useState<string[]>([]);
  const [genreList, setGenreList] = useState<string[] | null>(null);
  const [spotify, setSpotify] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shared = useMemo(
    () => ({
      ...Object.fromEntries(SCALARS.map((f) => [f.key, sharedOf(rows, (r) => r[f.key])])),
      artist: sharedOf(rows, (r) => r.artist),
      albumartist: sharedOf(rows, (r) => r.albumartist),
    }) as Record<Scalar, { value: string | null; count: number }> & Record<'artist' | 'albumartist', { value: string[] | null; count: number }>,
    [rows],
  );

  // Genres across the pick: how many songs have each.
  const genreCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) for (const g of r.genre) m.set(g, (m.get(g) ?? 0) + 1);
    return m;
  }, [rows]);

  const scalarChanges: TagSet = {};
  for (const f of SCALARS) {
    const t = typed[f.key];
    if (t === undefined) continue;
    const was = shared[f.key].value;
    if (was === null ? t === '' : t.trim() === was.trim()) continue;
    scalarChanges[f.key] = t.trim();
  }
  for (const k of ['artist', 'albumartist'] as const) {
    const t = lists[k];
    if (t && JSON.stringify(t) !== JSON.stringify(shared[k].value)) scalarChanges[k] = t;
  }
  if (one && genreList && JSON.stringify(genreList) !== JSON.stringify(one.genre)) scalarChanges.genre = genreList;
  const link = spotify === null ? undefined : spotifyId(spotify);
  const badLink = spotify !== null && spotify.trim() !== '' && !link;
  const linkChange = one && spotify !== null && !badLink && (link ?? '') !== one.spotifyid;
  const dirty = Object.keys(scalarChanges).length > 0 || genreAdd.length > 0 || genreRemove.length > 0 || !!linkChange;
  useEffect(() => onDirty(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirty(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const revert = () => {
    setTyped({});
    setLists({});
    setGenreAdd([]);
    setGenreRemove([]);
    setGenreList(null);
    setSpotify(null);
  };

  const save = async () => {
    if (!dirty || badLink) return;
    const set: TagSet = { ...scalarChanges };
    const clear: TagField[] = [];
    if (linkChange) {
      if (link) set.spotifyid = link;
      else clear.push('spotifyid');
    }
    const parts = [
      ...Object.entries(set).map(([k, v]) => `${k === 'date' ? 'Year' : k} → “${Array.isArray(v) ? v.join(', ') : v}”`),
      ...genreAdd.map((g) => `Genre +${g}`),
      ...genreRemove.map((g) => `Genre −${g}`),
      ...clear.map(() => 'Spotify link removed'),
    ];
    setBusy(true);
    const ok = await writeBatch({
      src,
      items: rows.map((r) => ({ p: r.p })),
      set,
      clear,
      lists: genreAdd.length || genreRemove.length ? { genre: { add: genreAdd, remove: genreRemove } } : undefined,
      desc: `${parts.slice(0, 3).join(' · ')}${parts.length > 3 ? ' …' : ''} · ${rows.length} ${rows.length === 1 ? 'file' : 'files'}`,
    });
    setBusy(false);
    if (ok) {
      revert();
      onDirty(false);
    }
  };

  // Ctrl+S saves the pick's changes.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pickArt = async (art: PickedArt) => {
    if ('folder' in art) return;
    if (rows.length > 1 && !(await confirmAction(`Use This Cover on ${rows.length} Songs?`, 'It’s written into every picked file. Covers aren’t part of undo.', 'Use It'))) return;
    try {
      const j = await runJob<{ rows: unknown[][] }>(setArtMany(src, rows.map((r) => r.p), art), 'Writing the cover');
      patchRows(src, ROW_COLS, j.result?.rows);
      refreshRakkiSoon();
      toast(rows.length === 1 ? 'Cover saved' : `Cover saved to ${rows.length} songs`);
    } catch (e) {
      toast(`Couldn’t use that cover: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
    }
  };
  const removeArt = async () => {
    if (!(await confirmAction(rows.length === 1 ? 'Remove the Cover?' : `Remove the Covers From ${rows.length} Songs?`, 'Covers aren’t part of undo.', 'Remove'))) return;
    const j = await runJob<{ rows: unknown[][] }>(setArtMany(src, rows.map((r) => r.p), { remove: true }), 'Removing covers').catch(() => null);
    patchRows(src, ROW_COLS, j?.result?.rows);
  };

  const first = rows[0];
  const covers = new Set(rows.map((r) => (r.art ? `${r.aw}x${r.ah}x${r.ab}` : 'none'))).size;
  const old = rows.filter((r) => r.ext === 'mp3' && r.id3 && r.id3 !== '2.4');

  // Genres: on every song (solid, in order for one song) and on some (dashed, with counts).
  const total = rows.length;
  const allGenres = one ? (genreList ?? one.genre) : [...[...genreCounts].filter(([g, n]) => n === total && !genreRemove.includes(g)).map(([g]) => g), ...genreAdd.filter((g) => (genreCounts.get(g) ?? 0) < total)];
  const partial = one ? [] : [...genreCounts].filter(([g, n]) => n < total && !genreRemove.includes(g) && !genreAdd.includes(g)).map(([value, count]) => ({ value, count }));

  const changeGenres = (next: string[]) => {
    if (one) return setGenreList(next);
    const before = new Set(allGenres);
    const after = new Set(next);
    const removed = [...before].filter((g) => !after.has(g));
    const added = [...after].filter((g) => !before.has(g));
    setGenreAdd((a) => [...a.filter((g) => !removed.includes(g)), ...added]);
    setGenreRemove((r) => [...r.filter((g) => !added.includes(g)), ...removed.filter((g) => !genreAdd.includes(g))]);
  };

  return (
    <div className="tg-panel-body" onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && void save()}>
      <div className="tg-panel-head">
        <CoverBox
          src={first.art ? artUrl(libraryTid(first.p), first.mt, 320) : null}
          info={one && one.art ? { w: one.aw, h: one.ah, bytes: one.ab } : null}
          onPick={(a) => void pickArt(a)}
          onRemove={() => void removeArt()}
          search={`${first.albumartist[0] ?? first.artist[0] ?? ''} ${first.album}`}
          size={112}>
          {covers > 1 ? <span className="tg-cover-badge">{covers} covers</span> : null}
        </CoverBox>
        <div className="tg-panel-title">
          <h3 className="ellipsis">{one ? one.title || one.p.split('/').pop() : `${rows.length} Songs`}</h3>
          <p className="muted small ellipsis">{one ? `${one.artist.join(', ')} · ${one.album}` : ((n) => `${n} ${n === 1 ? 'album' : 'albums'}`)(new Set(rows.map((r) => r.album)).size)}</p>
          {one ? (
            <button className="tg-linkbtn" onClick={() => showRaw(src, one)}>
              <Info size={13} /> All Tags in the File
            </button>
          ) : null}
        </div>
      </div>
      {old.length ? (
        <div className="tg-banner small">
          {old.length === 1 ? 'This file uses' : `${old.length} files use`} old ID3v2.3 tags: Jellyfin sees only the first artist and genre.
          <button
            className="secondary small"
            onClick={() =>
              void runJob<{ rows: unknown[][] }>(toV24(src, old.map((r) => r.p)), 'Converting').then((j) => {
                patchRows(src, ROW_COLS, j.result?.rows);
                toast('Converted to ID3v2.4');
              })
            }>
            Convert
          </button>
        </div>
      ) : null}
      <div className="tg-panel-fields">
        {one ? <ScalarField f={SCALARS[0]} shared={shared.title} typed={typed.title} set={(v) => setTyped((t) => ({ ...t, title: v }))} /> : null}
        <ScalarField f={SCALARS[1]} shared={shared.album} typed={typed.album} set={(v) => setTyped((t) => ({ ...t, album: v }))} />
        <ListField label="Artists" kind="artist" shared={shared.artist} value={lists.artist} set={(v) => setLists((l) => ({ ...l, artist: v }))} />
        <ListField label="Album Artist" kind="artist" shared={shared.albumartist} value={lists.albumartist} set={(v) => setLists((l) => ({ ...l, albumartist: v }))} />
        <div className="tg-panel-row">
          {SCALARS.filter((f) => f.narrow && f.key !== 'releasetype').map((f) => (
            <ScalarField key={f.key} f={f} shared={shared[f.key]} typed={typed[f.key]} set={(v) => setTyped((t) => ({ ...t, [f.key]: v }))} />
          ))}
        </div>
        <label className={`tg-field${typed.releasetype !== undefined ? ' changed' : ''}`}>
          <span className="field-label">Release Type</span>
          <select className="field select" value={typed.releasetype ?? shared.releasetype.value ?? ''} onChange={(e) => setTyped((t) => ({ ...t, releasetype: e.target.value }))} aria-label="Release Type">
            {shared.releasetype.value === null && typed.releasetype === undefined ? <option value="">Keep ({shared.releasetype.count} different)</option> : <option value="">None</option>}
            {RELEASE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className={`tg-field${genreAdd.length || genreRemove.length || genreList ? ' changed' : ''}`}>
          <span className="field-label">
            Genres
            {!one && genreAdd.length + genreRemove.length ? (
              <span className="muted small">
                {' '}
                {genreAdd.length ? `+${genreAdd.join(', +')}` : ''} {genreRemove.length ? `−${genreRemove.join(', −')}` : ''}
              </span>
            ) : null}
          </span>
          <Chips
            kind="genre"
            values={allGenres}
            onChange={changeGenres}
            partial={partial}
            total={total}
            onFill={(g) => setGenreAdd((a) => [...a, g])}
            onRemoveAll={(g) => setGenreRemove((r) => [...r, g])}
            placeholder={one ? 'Add genres' : 'Add a genre to every song'}
          />
        </div>
        <ScalarField f={SCALARS[6]} shared={shared.composer} typed={typed.composer} set={(v) => setTyped((t) => ({ ...t, composer: v }))} />
        {one ? (
          <label className={`tg-field${linkChange ? ' changed' : ''}`}>
            <span className="field-label">Spotify Link</span>
            <input
              className={`field${badLink ? ' invalid' : ''}`}
              value={spotify ?? (one.spotifyid ? spotifyLink(one.spotifyid) : '')}
              onChange={(e) => setSpotify(e.target.value)}
              placeholder="Paste the song’s link from Spotify"
              aria-label="Spotify Link"
              spellCheck={false}
            />
            {badLink ? <span className="error small">That isn’t a Spotify song link.</span> : <span className="muted small">Spicy Lyrics finds word-synced lyrics by this link.</span>}
          </label>
        ) : (
          <div className="tg-field">
            <span className="field-label">Spotify Links</span>
            <span className="muted small">
              {rows.filter((r) => r.spotifyid).length} of {rows.length} have one.{' '}
              <button
                className="tg-linkbtn"
                onClick={() =>
                  spotifyLinksDialog(
                    rows.map((r) => ({ key: r.p, title: r.title, n: parseInt(r.tracknumber, 10) || 0, length: r.length, has: r.spotifyid })),
                    (ids, l) => void writeBatch({ src, items: [...ids].map(([p, id]) => ({ p, set: { spotifyid: id } })), desc: `Spotify links from ${l.slice(0, 60)} · ${ids.size} files` }),
                  )
                }>
                From an Album Link
              </button>
            </span>
          </div>
        )}
        {one ? <FileFacts r={one} /> : null}
      </div>
      <div className="tg-panel-actions">
        <button className="secondary small" onClick={revert} disabled={!dirty || busy}>
          <Undo size={14} /> Revert
        </button>
        <button className="primary small" onClick={() => void save()} disabled={!dirty || busy || badLink} title="Ctrl+S">
          {busy ? 'Saving…' : `Save ${rows.length === 1 ? 'File' : `${rows.length} Files`}`}
        </button>
      </div>
    </div>
  );
}

function ScalarField({ f, shared, typed, set }: { f: { key: Scalar; label: string; narrow?: boolean }; shared: { value: string | null; count: number }; typed: string | undefined; set(v: string): void }) {
  const mixed = shared.value === null;
  const value = typed ?? shared.value ?? '';
  const changed = typed !== undefined && (mixed ? typed !== '' : typed.trim() !== (shared.value ?? '').trim());
  const removed = changed && typed?.trim() === '' && !mixed;
  return (
    <label className={`tg-field${changed ? (removed ? ' removed' : ' changed') : ''}`}>
      <span className="field-label">{f.label}</span>
      <input className="field" value={value} placeholder={mixed ? (f.narrow ? 'Keep' : `Keep (${shared.count} different)`) : ''} title={mixed ? `${shared.count} different values: left as they are unless you type` : undefined} onChange={(e) => set(e.target.value)} spellCheck={false} aria-label={f.label} />
    </label>
  );
}

function ListField({ label, kind, shared, value, set }: { label: string; kind: 'artist'; shared: { value: string[] | null; count: number }; value: string[] | undefined; set(v: string[]): void }) {
  const mixed = shared.value === null;
  const changed = value !== undefined && JSON.stringify(value) !== JSON.stringify(shared.value);
  return (
    <div className={`tg-field${changed ? ' changed' : ''}`}>
      <span className="field-label">{label}</span>
      {mixed && value === undefined ? (
        <button className="field tg-keep" onClick={() => set([])}>
          Keep ({shared.count} different) · <span className="tg-linkish">Set for All</span>
        </button>
      ) : (
        <Chips kind={kind} values={value ?? shared.value ?? []} onChange={set} label={label} />
      )}
    </div>
  );
}

function FileFacts({ r }: { r: Row }) {
  return (
    <dl className="tg-facts">
      <dt>File</dt>
      <dd title={r.p}>{r.p}</dd>
      <dt>Format</dt>
      <dd>
        {r.ext.toUpperCase()}
        {r.bitrate ? ` · ${r.bitrate} kbps` : ''}
        {r.id3 ? ` · ID3v${r.id3}` : ''} · {(r.size / 1048576).toFixed(1)} MB · {fmtLength(r.length)}
      </dd>
    </dl>
  );
}

function showRaw(src: Src, r: Row) {
  showDialog(<RawTagsView src={src} r={r} />);
}

function RawTagsView({ src, r }: { src: Src; r: Row }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof rawTags>> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    rawTags(src, r.p)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'MRQ didn’t answer'));
  }, [src, r.p]);
  return (
    <div className="tg-dialog tg-raw">
      <h2 className="dialog-title">All Tags in the File</h2>
      <p className="muted small ellipsis">{r.p}</p>
      {data ? (
        <p className="muted small">
          {data.info.codec} · {data.info.sample_rate} Hz · {data.info.channels} channels{data.info.bits ? ` · ${data.info.bits}-bit` : ''} · {Math.round(data.info.bitrate / 1000) || r.bitrate} kbps{data.id3 ? ` · ID3v${data.id3}` : ''}
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="tg-raw-list">
        {data?.tags.map(([k, v], i) => (
          <div key={i} className="tg-raw-row">
            <span className="tg-raw-key">{k}</span>
            <span className="tg-raw-val">{v}</span>
          </div>
        )) ?? Array.from({ length: 8 }, (_, i) => <div key={i} className="tg-raw-row skel-line" />)}
      </div>
      <div className="dialog-actions">
        <button className="secondary" onClick={closeDialog}>
          Close
        </button>
      </div>
    </div>
  );
}
