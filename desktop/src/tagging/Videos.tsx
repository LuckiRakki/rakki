// Tagging → Videos: music videos, the way the inbox does songs. Queue = new downloads waiting
// (MeTube's folder); Library = Jellyfin's Music Videos. Tags go into the video's .nfo (the file
// Jellyfin reads; .mp4 files get them embedded too), and Send files the video into
// Artist/Title/Artist - Title.ext with its poster and other files.
// Pick one video to watch it beside its tags; pick several (Ctrl/Shift-click, or click an artist)
// to set artist, album, year, director and genres on all of them at once.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';

import {
  getVideos,
  posterUrl,
  refileVideo,
  rejectVideo,
  runJob,
  saveVideos,
  sendVideo,
  setPoster,
  splitValues,
  videoLibSongs,
  videoLookup,
  videoUrl,
  type LibSong,
  type Src,
  type VideoLookup,
  type VideoMatch,
  type VideoRow,
  type VideoSet,
  artUrl,
} from '~/tagging/api';
import { Chips } from '~/tagging/Chips';
import { CoverBox, type PickedArt } from '~/tagging/Cover';
import { fmtLength, refreshRakkiSoon, useMrqUrl } from '~/tagging/data';
import { undoEdit } from '~/tagging/LibraryTab';
import { queryClient } from '~/queries';
import { Check, Ellipsis, ExternalLink, MonitorPlay, Search, Sparkles, Trash2 } from '~/ui/icons';
import { closeDialog, confirmAction, openMenu, showDialog, toast } from '~/ui/overlays';
import { Empty } from '~/ui/states';
import { openLink } from '~/lib/links';

interface Form {
  title: string;
  artist: string[];
  album: string;
  year: string;
  genre: string[];
  director: string[];
  plot: string;
}

const formOf = (v: VideoRow): Form =>
  v.tagged
    ? { title: v.title, artist: v.artist, album: v.album, year: v.year, genre: v.genre, director: v.director, plot: v.plot }
    : // A fresh download starts from its file name.
      { title: v.title || v.guess.title, artist: v.artist.length ? v.artist : splitValues(v.guess.artist), album: v.album, year: v.year, genre: v.genre, director: v.director, plot: v.plot };

const setOf = (f: Form): VideoSet => ({ title: f.title.trim(), artist: f.artist, album: f.album.trim(), year: f.year.trim(), genre: f.genre, director: f.director, plot: f.plot.trim() });
const artistOf = (v: VideoRow) => v.artist[0] || v.guess.artist || 'Unknown Artist';

export function Videos() {
  const url = useMrqUrl();
  const [src, setSrc] = useState<Src>('S');
  const q = useQuery({ queryKey: ['mrq', url, 'videos', src], queryFn: () => getVideos(src), refetchInterval: src === 'S' ? 20_000 : false });
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [anchor, setAnchor] = useState(-1);

  const shown = useMemo(() => {
    const f = filter.toLowerCase();
    const list = rows.filter((r) => !f || `${r.file} ${r.title} ${r.artist.join(' ')} ${r.album}`.toLowerCase().includes(f));
    return list.sort((a, b) => artistOf(a).localeCompare(artistOf(b), undefined, { sensitivity: 'base' }) || (a.title || a.file).localeCompare(b.title || b.file));
  }, [rows, filter]);
  const groups = useMemo(() => {
    const out: { artist: string; rows: VideoRow[] }[] = [];
    for (const r of shown) {
      const a = artistOf(r);
      if (out.at(-1)?.artist.toLowerCase() === a.toLowerCase()) out.at(-1)?.rows.push(r);
      else out.push({ artist: a, rows: [r] });
    }
    return out;
  }, [shown]);

  const picked = shown.filter((r) => sel.includes(r.p));
  const current = picked.length === 1 ? picked[0] : null;
  useEffect(() => {
    if (!sel.length && shown[0]) setSel([shown[0].p]);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  const click = (e: ReactMouseEvent, r: VideoRow) => {
    const i = shown.indexOf(r);
    if (e.shiftKey && anchor >= 0) setSel(shown.slice(Math.min(anchor, i), Math.max(anchor, i) + 1).map((x) => x.p));
    else if (e.ctrlKey || e.metaKey) setSel((s) => (s.includes(r.p) ? s.filter((x) => x !== r.p) : [...s, r.p]));
    else setSel([r.p]);
    if (!e.shiftKey) setAnchor(i);
  };

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['mrq', url, 'videos'] });
  const next = (gone: string[]) => {
    const i = shown.findIndex((r) => gone.includes(r.p));
    const rest = shown.filter((r) => !gone.includes(r.p));
    setSel(rest[Math.min(Math.max(i, 0), rest.length - 1)] ? [rest[Math.min(Math.max(i, 0), rest.length - 1)].p] : []);
    refresh();
    refreshRakkiSoon();
  };

  if (q.data && !q.data.configured) {
    return <Empty icon={MonitorPlay} title="Music Videos Aren’t Set Up in MRQ" detail="Give MRQ the music video download folder and Jellyfin’s Music Videos library (MV_STAGING_DIR and MV_LIBRARY_DIR) to tag videos here." />;
  }
  return (
    <div className="tg-split">
      <aside className="tg-list" aria-label="Videos">
        <div className="filters" role="group" aria-label="Which Videos">
          {(['S', 'L'] as Src[]).map((s) => (
            <button
              key={s}
              className={src === s ? 'on' : ''}
              aria-pressed={src === s}
              onClick={() => {
                setSrc(s);
                setSel([]);
              }}>
              {s === 'S' ? 'Queue' : 'Library'}
              {q.data?.counts ? <span className="tg-count">{q.data.counts[s]}</span> : null}
            </button>
          ))}
        </div>
        <input className="field tg-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter Videos" aria-label="Filter Videos" spellCheck={false} />
        <div className="tg-list-rows">
          {!q.data
            ? Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="tg-group skel-row">
                  <span className="tg-thumb wide skel" />
                  <span className="skel-line" />
                </div>
              ))
            : groups.map((g) => (
                <div key={g.artist} className="tg-vgroup">
                  <button className="tg-vgroup-name" title="Pick all their videos (Ctrl-click to add)" onClick={(e) => setSel((s) => (e.ctrlKey || e.metaKey ? [...new Set([...s, ...g.rows.map((r) => r.p)])] : g.rows.map((r) => r.p)))}>
                    {g.artist} <span className="muted">{g.rows.length}</span>
                  </button>
                  {g.rows.map((r) => (
                    <button key={r.p} className={`tg-group video${sel.includes(r.p) ? ' on' : ''}`} onClick={(e) => click(e, r)} title={r.file}>
                      {r.poster ? <img className="tg-thumb wide" src={posterUrl(src, r.p, r.pmt, 160)} alt="" loading="lazy" draggable={false} /> : <span className="tg-thumb wide empty" />}
                      <span className="tg-group-name ellipsis">{r.title || r.guess.title || r.file}</span>
                      {!r.tagged ? <span className="tg-new-dot" title="No tags yet" /> : null}
                      {src === 'L' && r.filed === false ? <span className="tg-badge" title="Not in Artist/Title/ yet">Loose</span> : null}
                    </button>
                  ))}
                </div>
              ))}
          {q.data && !shown.length ? <p className="muted small tg-pad">{rows.length ? 'No video matches.' : src === 'S' ? 'No videos waiting.' : 'No music videos yet.'}</p> : null}
        </div>
      </aside>
      <section className="tg-main" aria-label="Video">
        {current ? <VideoEditor key={`${src}:${current.p}:${current.mt}`} src={src} v={current} onGone={next} onSaved={refresh} /> : picked.length > 1 ? <ManyVideos key={picked.map((p) => p.p).join('|')} src={src} rows={picked} onGone={next} onSaved={refresh} /> : q.data ? <Empty icon={MonitorPlay} title="Pick a Video" detail="Pick one to watch and tag it, or several to tag them together." /> : null}
      </section>
    </div>
  );
}

// ---- One video ----

function VideoEditor({ src, v, onGone, onSaved }: { src: Src; v: VideoRow; onGone(p: string[]): void; onSaved(): void }) {
  const [f, setF] = useState<Form>(() => formOf(v));
  const [busy, setBusy] = useState(false);
  const [poster, setPosterNow] = useState<string | null>(v.poster ? posterUrl(src, v.p, v.pmt, 320) : null);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const start = formOf(v);
  const dirty = JSON.stringify(setOf(f)) !== JSON.stringify(setOf(start)) || !v.tagged;
  const guessDiffers = v.tagged && v.guess.title && (v.guess.title.toLowerCase() !== v.title.toLowerCase() || (v.guess.artist && v.guess.artist.toLowerCase() !== (v.artist[0] ?? '').toLowerCase()));

  const save = async () => {
    setBusy(true);
    try {
      const j = await runJob<{ history?: string }>(saveVideos(src, [{ p: v.p }], setOf(f), `Video: ${f.artist[0] ?? ''} - ${f.title}`), 'Saving the video');
      onSaved();
      refreshRakkiSoon();
      const h = j.result?.history;
      toast('Video saved', h ? { label: 'Undo', run: () => void undoEdit(h) } : undefined);
    } catch (e) {
      toast(`Couldn’t save: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (!f.artist.length || !f.title.trim()) return toast('A video needs an artist and a title to be filed');
    setBusy(true);
    try {
      await (src === 'S' ? sendVideo : refileVideo)(v.p, setOf(f));
      toast(src === 'S' ? `Sent “${f.title}” to your library` : `Moved “${f.title}” into ${f.artist[0]}/${f.title}/`);
      onGone([v.p]);
    } catch (e) {
      toast(`Couldn’t ${src === 'S' ? 'send' : 'move'} it: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
    } finally {
      setBusy(false);
    }
  };
  const reject = async () => {
    setBusy(true);
    await rejectVideo(v.p).then(
      () => {
        toast(`Moved “${f.title || v.file}” to Rejected`);
        onGone([v.p]);
      },
      (e: unknown) => toast(`Couldn’t reject it: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`),
    );
    setBusy(false);
  };
  const pickPoster = (art: PickedArt | { remove: true }) => {
    if ('folder' in art) return;
    if ('file' in art) setPosterNow(URL.createObjectURL(art.file));
    else if ('url' in art) setPosterNow(art.url);
    else setPosterNow(null);
    void setPoster(src, v.p, art)
      .then(() => {
        onSaved();
        toast('remove' in art ? 'Poster removed' : 'Poster saved');
      })
      .catch((e: unknown) => toast(`Couldn’t save the poster: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`));
  };

  return (
    <div
      className="tg-video"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          void save();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          void send();
        }
      }}>
      <div className="tg-video-player">
        <video src={videoUrl(src, v.p)} controls preload="metadata" poster={poster ?? undefined} />
        <p className="muted small ellipsis" title={v.p}>
          {v.file} · {fmtLength(v.length)}
          {v.w ? ` · ${v.w}×${v.h}` : ''} · {(v.size / 1048576).toFixed(0)} MB
        </p>
        <div className="tg-video-poster">
          <CoverBox src={poster} onPick={pickPoster} onRemove={() => pickPoster({ remove: true })} search={`${f.artist[0] ?? ''} ${f.title}`} size={96} label="Poster" />
          <p className="muted small">Poster: drop or paste a picture, or click for more. Without one, Jellyfin picks a frame itself.</p>
        </div>
      </div>
      <div className="tg-video-form">
        <div className="tg-video-tools">
          <button className="secondary small" onClick={() => showDialog(<MatchSong v={v} f={f} onPick={(s) => set({ title: s.title, artist: s.artist, album: s.album, year: s.date.slice(0, 4), genre: s.genre })} />)}>
            <Search size={15} /> Match Song
          </button>
          <button className="secondary small" onClick={() => showDialog(<VideoAutoFill v={v} f={f} onFill={(p, posterLink) => (set(p), posterLink && pickPoster({ url: posterLink }))} />)}>
            <Sparkles size={15} /> Auto-Fill
          </button>
          <button className="secondary small" onClick={() => set({ artist: splitValues(f.title), title: f.artist.join(', ') })} title="The file name had them the other way round">
            Swap Artist and Title
          </button>
        </div>
        {guessDiffers ? (
          <p className="tg-hint">
            The file name says “{v.guess.artist ? `${v.guess.artist} - ` : ''}
            {v.guess.title}”.{' '}
            <button className="tg-linkbtn" onClick={() => set({ title: v.guess.title, ...(v.guess.artist ? { artist: splitValues(v.guess.artist) } : null) })}>
              Use That
            </button>
          </p>
        ) : null}
        <div className="tg-grid">
          <label className="tg-field wide">
            <span className="field-label">Title</span>
            <input className="field" value={f.title} onChange={(e) => set({ title: e.target.value })} spellCheck={false} aria-label="Title" autoFocus={!v.tagged} />
          </label>
          <div className="tg-field wide">
            <span className="field-label">Artists</span>
            <Chips kind="artist" values={f.artist} onChange={(x) => set({ artist: x })} />
          </div>
          <label className="tg-field">
            <span className="field-label">Album</span>
            <input className="field" value={f.album} onChange={(e) => set({ album: e.target.value })} spellCheck={false} aria-label="Album" />
          </label>
          <label className="tg-field narrow">
            <span className="field-label">Year</span>
            <input className="field" value={f.year} onChange={(e) => set({ year: e.target.value })} inputMode="numeric" aria-label="Year" />
          </label>
          <div className="tg-field wide">
            <span className="field-label">Genres</span>
            <Chips kind="genre" values={f.genre} onChange={(x) => set({ genre: x })} />
          </div>
          <div className="tg-field wide">
            <span className="field-label">Directors</span>
            <Chips kind="artist" values={f.director} onChange={(x) => set({ director: x })} label="Directors" placeholder="Add directors" />
          </div>
          <label className="tg-field wide">
            <span className="field-label">Description</span>
            <textarea className="field area" value={f.plot} onChange={(e) => set({ plot: e.target.value })} aria-label="Description" />
          </label>
        </div>
        <p className="muted small">
          {src === 'S' || v.filed === false
            ? f.artist[0] && f.title
              ? `Filed as Music Videos/${f.artist[0]}/${f.title}/`
              : 'Needs an artist and a title to be filed.'
            : `In ${v.p.split('/').slice(0, -1).join('/')}/`}
        </p>
        <div className="tg-card-actions">
          {src === 'S' ? (
            <button
              className="tg-icon-btn"
              aria-label="More"
              onClick={(e) => openMenu(e, [{ label: 'Reject', icon: Trash2, danger: true, run: () => void reject() }], v.file)}>
              <Ellipsis size={18} />
            </button>
          ) : null}
          <span className="tg-flex" />
          {src === 'S' ? (
            <button className="secondary small" onClick={() => void reject()} disabled={busy}>
              Reject
            </button>
          ) : null}
          <button className="secondary small" onClick={() => void save()} disabled={busy || !dirty} title="Ctrl+S">
            Save
          </button>
          {src === 'S' ? (
            <button className="primary small" onClick={() => void send()} disabled={busy} title="Ctrl+Enter">
              {busy ? 'Working…' : 'Send to Library'}
            </button>
          ) : v.filed === false ? (
            <button
              className="primary small"
              disabled={busy}
              onClick={() =>
                void confirmAction('Move It Into Artist/Title/?', 'Jellyfin sees a moved video as new, so its play count starts over.', 'Move It').then((ok) => ok && void send())
              }>
              Re-File
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---- Several videos ----

function ManyVideos({ src, rows, onGone, onSaved }: { src: Src; rows: VideoRow[]; onGone(p: string[]): void; onSaved(): void }) {
  const shared = (get: (r: VideoRow) => string) => {
    const s = new Set(rows.map(get));
    return s.size === 1 ? [...s][0] : null;
  };
  const start = { artist: shared((r) => r.artist.join('\\')), album: shared((r) => r.album), year: shared((r) => r.year), director: shared((r) => r.director.join('\\')) };
  const [typed, setTyped] = useState<Partial<Record<keyof typeof start, string>>>({});
  const [genres, setGenres] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const set: VideoSet = {};
  for (const k of Object.keys(start) as (keyof typeof start)[]) {
    const t = typed[k];
    if (t === undefined || t.trim() === (start[k] ?? '').replace(/\\/g, '; ')) continue;
    set[k] = k === 'artist' || k === 'director' ? splitValues(t) : t.trim();
  }
  const dirty = Object.keys(set).length > 0 || genres.length > 0;

  const save = async () => {
    setBusy(true);
    try {
      const items = rows.map((r) => ({ p: r.p, ...(genres.length ? { set: { genre: [...r.genre, ...genres.filter((g) => !r.genre.includes(g))] } } : null) }));
      const j = await runJob<{ history?: string; changed?: number }>(saveVideos(src, items, set, `Videos · ${rows.length}`), 'Saving videos');
      onSaved();
      setTyped({});
      setGenres([]);
      const h = j.result?.history;
      toast(`Saved ${j.result?.changed ?? rows.length} videos`, h ? { label: 'Undo', run: () => void undoEdit(h) } : undefined);
    } catch (e) {
      toast(`Couldn’t save: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
    } finally {
      setBusy(false);
    }
  };

  const fromNames = async () => {
    const items = rows.filter((r) => r.guess.title).map((r) => ({ p: r.p, set: { title: r.guess.title, ...(r.guess.artist ? { artist: splitValues(r.guess.artist) } : null) } }));
    if (!(await confirmAction(`Artist and Title From ${items.length} File Names?`, items.slice(0, 6).map((i) => `${(i.set.artist ?? []).join(', ')} - ${i.set.title}`).join(' · '), 'Use Them'))) return;
    const j = await runJob<{ history?: string }>(saveVideos(src, items, {}, `Videos: names from files · ${items.length}`), 'Saving videos').catch(() => null);
    onSaved();
    const h = j?.result?.history;
    toast('Names taken from the files', h ? { label: 'Undo', run: () => void undoEdit(h) } : undefined);
  };

  const sendAll = async () => {
    const ready = rows.filter((r) => (r.artist.length || r.guess.artist) && (r.title || r.guess.title));
    const verb = src === 'S' ? 'Send' : 'Re-File';
    const list = src === 'S' ? ready : ready.filter((r) => r.filed === false);
    if (!list.length) return toast(src === 'S' ? 'None of these has an artist and a title yet' : 'These are all filed already');
    if (!(await confirmAction(`${verb} ${list.length} Videos?`, src === 'S' ? 'Each goes into Music Videos/Artist/Title/ with its files.' : 'Jellyfin sees moved videos as new, so their play counts start over.', verb))) return;
    setBusy(true);
    const gone: string[] = [];
    for (const r of list) {
      const f = formOf(r);
      await (src === 'S' ? sendVideo : refileVideo)(r.p, setOf(f)).then(() => gone.push(r.p), () => undefined);
    }
    setBusy(false);
    toast(`${src === 'S' ? 'Sent' : 'Moved'} ${gone.length} of ${list.length} videos`);
    onGone(gone);
  };

  const field = (k: keyof typeof start, label: string) => (
    <label className={`tg-field${typed[k] !== undefined ? ' changed' : ''}`}>
      <span className="field-label">{label}</span>
      <input
        className="field"
        value={typed[k] ?? (start[k] ?? '').replace(/\\/g, '; ')}
        placeholder={start[k] === null ? 'Keep (different)' : ''}
        onChange={(e) => setTyped((t) => ({ ...t, [k]: e.target.value }))}
        spellCheck={false}
        aria-label={label}
      />
    </label>
  );

  return (
    <div className="tg-many">
      <h2>{rows.length} Videos</h2>
      <div className="tg-many-posters">
        {rows.slice(0, 8).map((r) => (r.poster ? <img key={r.p} src={posterUrl(src, r.p, r.pmt, 160)} alt="" /> : <span key={r.p} className="tg-thumb wide empty" />))}
      </div>
      <div className="tg-grid">
        {field('artist', 'Artists (; between)')}
        {field('album', 'Album')}
        {field('year', 'Year')}
        {field('director', 'Directors (; between)')}
        <div className="tg-field wide">
          <span className="field-label">Add Genres to All</span>
          <Chips kind="genre" values={genres} onChange={setGenres} />
        </div>
      </div>
      <div className="tg-card-actions">
        <button className="secondary small" onClick={() => showDialog(<ManyAutoFill src={src} rows={rows} onDone={onSaved} />)}>
          <Sparkles size={15} /> Auto-Fill
        </button>
        <button className="secondary small" onClick={() => void fromNames()}>
          Artist and Title From File Names
        </button>
        <span className="tg-flex" />
        <button className="secondary small" disabled={!dirty || busy} onClick={() => void save()}>
          Save {rows.length}
        </button>
        <button className="primary small" disabled={busy} onClick={() => void sendAll()}>
          {src === 'S' ? `Send to Library` : 'Re-File Loose Ones'}
        </button>
      </div>
    </div>
  );
}

// ---- Match the song in your library ----

function MatchSong({ v, f, onPick }: { v: VideoRow; f: Form; onPick(s: LibSong): void }) {
  const [term, setTerm] = useState('');
  const [list, setList] = useState<LibSong[] | null>(null);
  useEffect(() => {
    setList(null);
    const id = setTimeout(
      () => {
        (term.trim() ? videoLibSongs({ q: term.trim() }) : videoLibSongs({ artist: f.artist[0] ?? v.guess.artist, title: f.title || v.guess.title }))
          .then((r) => setList(r.rows))
          .catch(() => setList([]));
      },
      term ? 220 : 0,
    );
    return () => clearTimeout(id);
  }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tg-dialog">
      <h2 className="dialog-title">Match the Song</h2>
      <p className="muted small">Copies the song’s title, artists, album, year and genres, so the video and the song are spelled the same in Jellyfin.</p>
      <input className="field" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search your library by title, artist or album" aria-label="Search songs" spellCheck={false} autoFocus />
      <div className="tg-album-pick">
        {list === null
          ? Array.from({ length: 4 }, (_, i) => <span key={i} className="tg-album-row skel-line" />)
          : list.map((s) => (
              <button
                key={s.p}
                className="tg-album-row"
                onClick={() => {
                  closeDialog();
                  onPick(s);
                }}>
                {s.art ? <img className="tg-thumb" src={artUrl(s.tid, s.mt, 64)} alt="" draggable={false} /> : <span className="tg-thumb empty" />}
                <span className="ellipsis">
                  <b>{s.title}</b>
                  <span className="muted small">
                    {' '}
                    · {s.artist.join(', ')} · {s.album} {s.date ? `(${s.date.slice(0, 4)})` : ''}
                  </span>
                </span>
              </button>
            ))}
        {list?.length === 0 ? <p className="muted">No song matches. Search for it above.</p> : null}
      </div>
      <div className="dialog-actions">
        <button className="secondary" onClick={closeDialog}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Auto-Fill from the web (one video) ----

const VFIELDS: { key: keyof Form | 'poster'; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artists' },
  { key: 'album', label: 'Album' },
  { key: 'year', label: 'Year' },
  { key: 'genre', label: 'Genres' },
  { key: 'director', label: 'Directors' },
  { key: 'plot', label: 'Description' },
  { key: 'poster', label: 'Poster' },
];

const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));
const matchValue = (m: VideoMatch, k: keyof Form | 'poster') => (k === 'year' ? (m.year ?? m.date ?? '').slice(0, 4) : (m as Record<string, unknown>)[k]);

function VideoAutoFill({ v, f, onFill }: { v: VideoRow; f: Form; onFill(p: Partial<Form>, poster?: string): void }) {
  const [artist, setArtist] = useState(f.artist[0] ?? v.guess.artist);
  const [title, setTitle] = useState(f.title || v.guess.title);
  const [res, setRes] = useState<VideoLookup['results'][string] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({});
  const [on, setOn] = useState<Record<string, boolean>>({});

  const look = () => {
    setBusy(true);
    setError('');
    runJob<VideoLookup>(videoLookup([{ k: 'v', artist, title, length: v.length }]), `Looking up ${title}`)
      .then((j) => {
        const r = j.result?.results.v ?? null;
        setRes(r);
        const m = r?.m;
        if (!m) return;
        // Empty fields (and a fresh download's guessed names) are ticked.
        setOn(Object.fromEntries(VFIELDS.map((x) => [x.key, !!show(matchValue(m, x.key)) && (x.key === 'poster' ? !v.poster : !show(f[x.key as keyof Form]) || (!v.tagged && (x.key === 'title' || x.key === 'artist')))])));
        setPick(Object.fromEntries(VFIELDS.map((x) => [x.key, 'best'])));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'The look-up failed'))
      .finally(() => setBusy(false));
  };
  useEffect(look, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sources = Object.entries(res?.sources ?? {});
  const valueOf = (k: keyof Form | 'poster') => {
    const from = pick[k];
    const m = from && from !== 'best' ? res?.sources[from] : res?.m;
    return m ? matchValue(m, k) : undefined;
  };
  const apply = () => {
    const p: Partial<Form> = {};
    let poster: string | undefined;
    for (const x of VFIELDS) {
      if (!on[x.key]) continue;
      const val = valueOf(x.key);
      if (x.key === 'poster') poster = String(val ?? '') || undefined;
      else if (x.key === 'artist' || x.key === 'genre' || x.key === 'director') Object.assign(p, { [x.key]: Array.isArray(val) ? val : splitValues(String(val ?? '')) });
      else Object.assign(p, { [x.key]: String(val ?? '') });
    }
    closeDialog();
    onFill(p, poster);
  };

  return (
    <div className="tg-dialog tg-fill">
      <h2 className="dialog-title">Auto-Fill the Video</h2>
      <p className="muted small">Looks on IMDb, YouTube, MusicBrainz, iTunes and your library. Genres only come from the song in your library.</p>
      <form
        className="row-form"
        onSubmit={(e) => {
          e.preventDefault();
          look();
        }}>
        <input className="field" value={artist} onChange={(e) => setArtist(e.target.value)} aria-label="Artist" placeholder="Artist" spellCheck={false} />
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" placeholder="Title" spellCheck={false} />
        <button className="secondary" disabled={busy || !artist.trim() || !title.trim()}>
          {busy ? 'Looking…' : 'Search'}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {sources.length ? (
        <p className="tg-sources">
          {sources.map(([name, s]) => (
            <button key={name} className="tg-badge" disabled={!s.link} onClick={() => s.link && openLink(s.link)} title={s.link ? 'Open the page it came from' : undefined}>
              {name} {s.score ? `${s.score}` : ''} {s.link ? <ExternalLink size={11} /> : null}
            </button>
          ))}
        </p>
      ) : null}
      {res && !res.m && !busy ? <p className="muted">Nothing found. Change the names and search again.</p> : null}
      {res?.m ? (
        <div className="tg-fill-list">
          {VFIELDS.map((x) => {
            const found = show(valueOf(x.key));
            const has = sources.filter(([, s]) => show(matchValue(s, x.key)));
            if (!show(matchValue(res.m as VideoMatch, x.key)) && !has.length) return null;
            return (
              <label key={x.key} className="tg-vfill-row">
                <input type="checkbox" checked={!!on[x.key]} onChange={(e) => setOn((o) => ({ ...o, [x.key]: e.target.checked }))} />
                <span className="muted">{x.label}</span>
                <span className="tg-vfill-vals">
                  {x.key !== 'poster' && show(f[x.key as keyof Form]) ? <s className="muted">{show(f[x.key as keyof Form])}</s> : null}
                  {x.key === 'poster' && found ? <img src={found} alt="" className="tg-thumb wide" /> : <span className="tg-new">{found}</span>}
                </span>
                {has.length > 1 ? (
                  <select className="field select sm" value={pick[x.key] ?? 'best'} onChange={(e) => setPick((p) => ({ ...p, [x.key]: e.target.value }))} aria-label={`Where ${x.label} comes from`}>
                    <option value="best">Best ({res.m?.from?.[x.key] ?? 'merged'})</option>
                    {has.map(([name]) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </label>
            );
          })}
        </div>
      ) : busy ? (
        <div className="tg-fill-list">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="tg-fill-song skel-line" />
          ))}
        </div>
      ) : null}
      <div className="dialog-actions">
        <button className="secondary" onClick={closeDialog}>
          Cancel
        </button>
        <button className="primary" disabled={!res?.m || !Object.values(on).some(Boolean)} onClick={apply}>
          Fill In
        </button>
      </div>
    </div>
  );
}

// ---- Auto-Fill several videos ----

function ManyAutoFill({ src, rows, onDone }: { src: Src; rows: VideoRow[]; onDone(): void }) {
  const [res, setRes] = useState<VideoLookup['results'] | null>(null);
  const [emptyOnly, setEmptyOnly] = useState(true);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    runJob<VideoLookup>(
      videoLookup(rows.map((r) => ({ k: r.p, artist: r.artist[0] ?? r.guess.artist, title: r.title || r.guess.title, length: r.length }))),
      `Looking up ${rows.length} videos`,
    )
      .then((j) => {
        const r = j.result?.results ?? {};
        setRes(r);
        setTicked(Object.fromEntries(rows.map((x) => [x.p, (r[x.p]?.score ?? 0) >= 75])));
      })
      .catch((e: unknown) => toast(`The look-up failed: ${e instanceof Error ? e.message : ''}`))
      .finally(() => setBusy(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changesFor = (r: VideoRow): { set: VideoSet; poster?: string } | null => {
    const m = res?.[r.p]?.m;
    if (!m) return null;
    const f = formOf(r);
    const set: VideoSet = {};
    for (const k of ['title', 'artist', 'album', 'year', 'director', 'plot'] as const) {
      const val = matchValue(m, k);
      if (!show(val)) continue;
      if (emptyOnly && show(f[k]) && r.tagged) continue;
      if (show(val) === show(f[k])) continue;
      set[k] = val as string | string[];
    }
    const poster = m.poster && (!emptyOnly || !r.poster) ? m.poster : undefined;
    return Object.keys(set).length || poster ? { set, poster } : null;
  };
  const chosen = rows.filter((r) => ticked[r.p] && changesFor(r));

  const apply = async () => {
    closeDialog();
    const items = chosen.map((r) => ({ p: r.p, set: changesFor(r)?.set ?? {} })).filter((i) => Object.keys(i.set).length);
    let history: string | undefined;
    if (items.length) {
      const j = await runJob<{ history?: string }>(saveVideos(src, items, {}, `Videos: auto-fill · ${items.length}`), 'Saving videos').catch(() => null);
      history = j?.result?.history;
    }
    for (const r of chosen) {
      const p = changesFor(r)?.poster;
      if (p) await setPoster(src, r.p, { url: p }).catch(() => undefined);
    }
    onDone();
    toast(`Filled in ${chosen.length} videos`, history ? { label: 'Undo', run: () => void undoEdit(history) } : undefined);
  };

  return (
    <div className="tg-dialog tg-fill">
      <h2 className="dialog-title">Auto-Fill {rows.length} Videos</h2>
      <label className="tg-check">
        <input type="checkbox" checked={emptyOnly} onChange={(e) => setEmptyOnly(e.target.checked)} />
        Only Fill Empty Fields
      </label>
      <div className="tg-fill-list">
        {busy
          ? rows.slice(0, 5).map((r) => <div key={r.p} className="tg-fill-song skel-line" />)
          : rows.map((r) => {
              const hit = res?.[r.p];
              const ch = changesFor(r);
              return (
                <div key={r.p} className={`tg-fill-song${!hit?.m ? ' miss' : !ch ? ' quiet' : ''}`}>
                  <label className="tg-fill-head">
                    <input type="checkbox" disabled={!ch} checked={!!ch && !!ticked[r.p]} onChange={(e) => setTicked((t) => ({ ...t, [r.p]: e.target.checked }))} />
                    <span className="ellipsis">
                      <b>{r.title || r.guess.title || r.file}</b>
                    </span>
                    {hit?.m ? <span className={`tg-score${hit.score < 75 ? ' low' : ''}`}>{hit.score}</span> : null}
                  </label>
                  {!hit?.m ? (
                    <p className="muted small">Not found.</p>
                  ) : ch ? (
                    <div className="tg-fill-rows">
                      {Object.entries(ch.set).map(([k, val]) => (
                        <span key={k} className="tg-fill-row">
                          <span className="muted">{VFIELDS.find((x) => x.key === k)?.label}</span>
                          <span className="tg-new">{show(val)}</span>
                        </span>
                      ))}
                      {ch.poster ? (
                        <span className="tg-fill-row">
                          <span className="muted">Poster</span>
                          <span className="tg-new">New</span>
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="muted small">Nothing to change.</p>
                  )}
                </div>
              );
            })}
      </div>
      <div className="dialog-actions">
        <button className="secondary" onClick={closeDialog}>
          Cancel
        </button>
        <button className="primary" disabled={!chosen.length} onClick={() => void apply()}>
          {chosen.length ? `Fill In ${chosen.length}` : 'Fill In'}
        </button>
      </div>
    </div>
  );
}


