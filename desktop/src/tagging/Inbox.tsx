// Tagging → Inbox: MRQ's review queue. New downloads wait here, by artist, to be tagged and sent
// into the library (MRQ writes the tags, then files them under Artist/Release (Year) (Type)/).
// Left: the artists waiting (a dot marks one who isn't in the library yet). Right: their releases,
// an album card for songs that share an album, a card for each single. Everything is edited in
// place and written only when you Save (keep in the inbox) or Send (into the library).
// Keys: J / K next and previous artist; Ctrl+Enter sends the card you're in, Ctrl+S saves it.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { spotifyId, spotifyLink } from '~/mrq/client';
import {
  addToAlbum,
  addToAlbumPreview,
  artUrl,
  confirmTrack,
  getGroup,
  getGroups,
  joinValues,
  libraryAlbums,
  RELEASE_TYPES,
  rejectTrack,
  rymTags,
  saveTrack,
  sendAlbum,
  setTrackArt,
  splitValues,
  validate,
  type AddPreview,
  type ArtChoice,
  type Group,
  type GroupDetail,
  type LibraryAlbum,
  type QueueTrack,
  type SendData,
  type Warning,
} from '~/tagging/api';
import { ArtistField, Chips } from '~/tagging/Chips';
import { CoverBox, pickedPreview, type PickedArt } from '~/tagging/Cover';
import { featMissing, fmtLength, refreshRakkiSoon, refreshTagging, trackNo, useLibraryArtists, useMrqUrl } from '~/tagging/data';
import { autoFillDialog, spotifyLinksDialog, type FillChanges } from '~/tagging/dialogs';
import { togglePreview, usePreview } from '~/tagging/preview';
import { queryClient } from '~/queries';
import { Check, Disc3, Ellipsis, Heart, Pause, Play, Search, Sparkles, Trash2, X } from '~/ui/icons';
import { closeDialog, confirmAction, openMenu, showDialog, toast } from '~/ui/overlays';
import { Bar, revealProps, revealWith, useReveal, partOf } from '~/ui/reveal';
import { Empty } from '~/ui/states';

// ---- Drafts: what you've typed, per song and per album, until it's saved or sent ----

interface Draft {
  title: string;
  artist: string[];
  albumartist: string;
  album: string;
  date: string;
  genre: string[];
  tracknumber: string;
  discnumber: string;
  composer: string;
  releasetype: string;
  /** The Spotify link as typed. */
  spotify: string;
  favorite: boolean;
}

interface AlbumDraft {
  album: string;
  albumartist: string;
  date: string;
  releasetype: string;
  genre: string[];
  art: PickedArt | null;
  link: string;
}

const draftOf = (t: QueueTrack, fileUnder: string): Draft => ({
  title: t.title,
  artist: splitValues(t.artist),
  albumartist: t.albumartist || fileUnder,
  album: t.album,
  date: t.date,
  genre: splitValues(t.genre, true),
  tracknumber: t.tracknumber,
  discnumber: t.discnumber,
  composer: t.composer,
  releasetype: t.releasetype,
  spotify: t.spotifyid ? spotifyLink(t.spotifyid) : '',
  favorite: false,
});

/** "1/12" → 12 when it says there are more songs on the release. */
const ofTotal = (n: string) => parseInt(/\/\s*(\d+)/.exec(n)?.[1] ?? '0', 10);
const discOf = (d: Draft) => parseInt(d.discnumber, 10) || 1;

/** A Spotify link as typed → what to send: undefined = unchanged, null = not a link. */
function spotifyOut(typed: string, had: string): string | null | undefined {
  const id = spotifyId(typed);
  if (typed.trim() && !id) return null;
  return id === had ? undefined : id;
}

// ---- The page ----

export function Inbox() {
  const url = useMrqUrl();
  const groupsQ = useQuery({ queryKey: ['mrq', url, 'groups'], queryFn: getGroups, refetchInterval: 15_000 });
  const groups = groupsQ.data;
  const [gid, setGid] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => (groups ?? []).filter((g) => !filter || g.artist.toLowerCase().includes(filter.toLowerCase())), [groups, filter]);
  const current = gid && groups?.some((g) => g.id === gid) ? gid : (shown[0]?.id ?? null);
  const [list] = useReveal([partOf(groups, { failed: groupsQ.isError })]);

  // J / K: next and previous artist, when you're not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'j' && e.key !== 'k') return;
      const i = shown.findIndex((g) => g.id === current);
      const next = shown[Math.min(shown.length - 1, Math.max(0, i + (e.key === 'j' ? 1 : -1)))];
      if (next) setGid(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, current]);

  const advance = () => {
    const i = shown.findIndex((g) => g.id === current);
    const next = shown[i + 1] ?? shown[i - 1];
    setGid(next && next.id !== current ? next.id : null);
  };

  if (groupsQ.isError) {
    return <Empty icon={Disc3} title="Couldn’t Reach MRQ" detail={groupsQ.error instanceof Error ? groupsQ.error.message : 'Check the address in Settings → Connections.'} action={{ label: 'Try Again', run: () => void groupsQ.refetch() }} />;
  }
  if (groups && !groups.length) {
    return <Empty icon={Check} title="The Inbox Is Empty" detail="New downloads show up here by themselves, ready to tag and send to your library." />;
  }
  return (
    <div className="tg-split">
      <aside className="tg-list" aria-label="Artists Waiting">
        <input className="field tg-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter Artists" aria-label="Filter Artists" spellCheck={false} />
        <div className="tg-list-rows">
          {list.show === 'placeholder'
            ? Array.from({ length: 6 }, (_, i) => (
                <div key={i} {...revealWith('tg-group skel-row', list)}>
                  <span className="tg-thumb skel" />
                  <Bar width="60%" />
                </div>
              ))
            : shown.map((g, i) => <GroupRow key={g.id} g={g} on={g.id === current} pick={() => setGid(g.id)} style={revealProps({ ...list, delay: list.delay + Math.min(i, 12) * 20 })} />)}
        </div>
      </aside>
      <section className="tg-main" aria-label="Releases">
        {current ? <ArtistView key={current} gid={current} onDone={advance} /> : null}
      </section>
    </div>
  );
}

function GroupRow({ g, on, pick, style }: { g: Group; on: boolean; pick(): void; style: { className?: string; style?: React.CSSProperties } }) {
  const url = useMrqUrl();
  return (
    <button
      className={`tg-group${on ? ' on' : ''} ${style.className ?? ''}`}
      style={style.style}
      aria-current={on || undefined}
      onClick={pick}
      // Fetch on hover, so the click opens at once.
      onMouseEnter={() => void queryClient.prefetchQuery({ queryKey: ['mrq', url, 'group', g.id], queryFn: () => getGroup(g.id), staleTime: 10_000 })}>
      <img className="tg-thumb" src={artUrl(g.thumb, g.v, 64)} alt="" loading="lazy" draggable={false} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      <span className="tg-group-name ellipsis">
        {g.compilation ? <Disc3 size={13} /> : null} {g.artist}
      </span>
      {!g.known ? <span className="tg-new-dot" title="Not in your library yet: a new artist folder is made" /> : null}
      <span className="tg-count">{g.count}</span>
    </button>
  );
}

// ---- One artist ----

type Release = { kind: 'album'; key: string; tids: string[] } | { kind: 'single'; tid: string };

interface Ctx {
  gid: string;
  group: GroupDetail;
  byTid: Map<string, QueueTrack>;
  drafts: Record<string, Draft>;
  setDraft(tid: string, p: Partial<Draft>): void;
  albums: Record<string, AlbumDraft>;
  setAlbum(key: string, p: Partial<AlbumDraft>): void;
  busy: Set<string>;
  send(r: Release): void;
  save(r: Release): void;
  reject(r: Release): void;
  detach(tid: string): void;
  ungroup(key: string): void;
  autoFill(r: Release): void;
  addTo(r: Release, album?: LibraryAlbum): void;
  coverNow: Record<string, string>;
  pickSingleArt(tid: string, art: PickedArt): void;
  fileUnder: string;
}

function ArtistView({ gid, onDone }: { gid: string; onDone(): void }) {
  const url = useMrqUrl();
  const q = useQuery({ queryKey: ['mrq', url, 'group', gid], queryFn: () => getGroup(gid), staleTime: 10_000 });
  const group = q.data;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [albums, setAlbums] = useState<Record<string, AlbumDraft>>({});
  const [member, setMember] = useState<Record<string, string | null>>({});
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [fileUnder, setFileUnder] = useState('');
  const [coverNow, setCoverNow] = useState<Record<string, string>>({});
  const [head] = useReveal([partOf(group, { failed: q.isError })]);

  // New songs get a draft, and songs sharing an album name are grouped into an album card.
  useEffect(() => {
    if (!group) return;
    const under = fileUnder || group.artist_match || group.artist;
    if (!fileUnder) setFileUnder(under);
    const fresh = group.tracks.filter((t) => !(t.id in member));
    if (!fresh.length) return;
    const nextDrafts = { ...drafts };
    const nextMember = { ...member };
    const nextAlbums = { ...albums };
    const buckets = new Map<string, QueueTrack[]>();
    for (const t of fresh) {
      nextDrafts[t.id] = draftOf(t, under);
      nextMember[t.id] = null;
      const name = t.album.trim();
      if (name) buckets.set(name.toLowerCase(), [...(buckets.get(name.toLowerCase()) ?? []), t]);
    }
    for (const [k, ts] of buckets) {
      const key = `a:${k}`;
      if (ts.length >= 2 || ts.some((t) => ofTotal(t.tracknumber) > 1) || nextAlbums[key]) {
        const f = ts[0];
        nextAlbums[key] ??= { album: f.album, albumartist: f.albumartist || under, date: f.date, releasetype: f.releasetype || 'Album', genre: splitValues(f.genre, true), art: null, link: '' };
        for (const t of ts) nextMember[t.id] = key;
      }
    }
    setDrafts(nextDrafts);
    setMember(nextMember);
    setAlbums(nextAlbums);
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

  const byTid = useMemo(() => new Map((group?.tracks ?? []).map((t) => [t.id, t])), [group]);
  const live = (group?.tracks ?? []).filter((t) => !gone.has(t.id) && drafts[t.id]);

  const releases = useMemo(() => {
    const out: Release[] = [];
    const seen = new Set<string>();
    for (const t of live) {
      const key = member[t.id];
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
        const tids = live.filter((x) => member[x.id] === key).map((x) => x.id);
        tids.sort((a, b) => discOf(drafts[a]) - discOf(drafts[b]) || trackNo(drafts[a].tracknumber) - trackNo(drafts[b].tracknumber));
        out.push({ kind: 'album', key, tids });
      } else out.push({ kind: 'single', tid: t.id });
    }
    return out;
  }, [live, member, drafts]);

  const setDraft = (tid: string, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [tid]: { ...d[tid], ...p } }));
  const setAlbum = (key: string, p: Partial<AlbumDraft>) => setAlbums((a) => ({ ...a, [key]: { ...a[key], ...p } }));
  const mark = (tids: string[], on: boolean) =>
    setBusy((b) => {
      const n = new Set(b);
      for (const t of tids) if (on) n.add(t);
      else n.delete(t);
      return n;
    });

  const tidsOf = (r: Release) => (r.kind === 'album' ? r.tids : [r.tid]);

  /** What a song would be written as (an album's songs take the album's fields). */
  const dataFor = (tid: string, key: string | null): SendData | null => {
    const d = drafts[tid];
    const t = byTid.get(tid);
    if (!d || !t) return null;
    const a = key ? albums[key] : null;
    const link = spotifyOut(d.spotify, t.spotifyid);
    if (link === null) return null;
    const albumartist = (a ? a.albumartist : d.albumartist) || fileUnder;
    return {
      title: d.title,
      artist: joinValues(d.artist.length ? d.artist : [albumartist]),
      albumartist,
      album: a ? a.album : d.album,
      date: a ? a.date : d.date,
      genre: joinValues(a ? a.genre : d.genre),
      tracknumber: d.tracknumber,
      discnumber: d.discnumber,
      composer: d.composer,
      releasetype: (a ? a.releasetype : d.releasetype) || (a ? 'Album' : 'Single'),
      ...(link !== undefined ? { spotifyid: link } : null),
      favorite: d.favorite,
    };
  };

  const finish = (tids: string[]) => {
    setGone((g) => new Set([...g, ...tids]));
    void queryClient.invalidateQueries({ queryKey: ['mrq', url, 'groups'] });
    refreshTagging('library');
    refreshRakkiSoon();
    const left = (group?.tracks ?? []).filter((t) => !gone.has(t.id) && !tids.includes(t.id));
    if (!left.length) onDone();
  };

  const send = async (r: Release) => {
    if (!group) return;
    const key = r.kind === 'album' ? r.key : null;
    const tids = tidsOf(r);
    const items = tids.map((tid) => ({ id: tid, data: dataFor(tid, key) }));
    const bad = items.find((i) => !i.data);
    if (bad) return toast(`Fix the Spotify link on “${drafts[bad.id]?.title}” first`);
    const first = items[0].data as SendData;
    const name = r.kind === 'album' ? first.album || 'the album' : first.title || 'the song';
    mark(tids, true);
    try {
      const { warnings } = await validate(gid, tids, first).catch(() => ({ warnings: [] as Warning[] }));
      const worth = warnings.filter((w) => w.level !== 'info');
      if (worth.length && !(await sendAnyway(name, worth))) return;
      if (r.kind === 'album') {
        const a = albums[r.key];
        const withArt = tids.find((t) => byTid.get(t)?.art);
        const art: ArtChoice = a?.art ? ('folder' in a.art ? { from: tids[0] } : a.art) : withArt ? { from: withArt } : null;
        if (a?.art && 'folder' in a.art) await setTrackArt(tids[0], a.art);
        const res = await sendAlbum(items as { id: string; data: SendData }[], art);
        const sent = res.results.filter((x) => x.ok).map((x) => x.id);
        const failed = res.results.filter((x) => !x.ok);
        finish(sent);
        toast(failed.length ? `Sent ${sent.length} of ${tids.length}. ${failed[0].error ?? ''}` : `Sent “${name}” to your library`);
      } else {
        await confirmTrack(r.tid, first);
        finish([r.tid]);
        toast(`Sent “${name}” to your library`);
      }
    } catch (e) {
      toast(`Couldn’t send it: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
      void q.refetch();
    } finally {
      mark(tids, false);
    }
  };

  const save = async (r: Release) => {
    const key = r.kind === 'album' ? r.key : null;
    const tids = tidsOf(r);
    mark(tids, true);
    try {
      for (const tid of tids) {
        const data = dataFor(tid, key);
        if (!data) throw new Error(`the Spotify link on “${drafts[tid]?.title}” isn't one`);
        await saveTrack(tid, data);
      }
      const art = key ? albums[key]?.art : null;
      if (art) {
        for (const tid of tids) await setTrackArt(tid, art);
        setAlbum(key as string, { art: null });
      }
      await q.refetch();
      toast(r.kind === 'album' ? 'Album saved. It stays in the inbox' : 'Saved. It stays in the inbox');
    } catch (e) {
      toast(`Couldn’t save: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
    } finally {
      mark(tids, false);
    }
  };

  const reject = async (r: Release) => {
    const tids = tidsOf(r);
    const name = r.kind === 'album' ? (albums[r.key]?.album ?? 'this album') : (drafts[r.tid]?.title ?? 'this song');
    if (tids.length > 1 && !(await confirmAction(`Reject “${name}”?`, `Its ${tids.length} songs move to MRQ’s rejected folder. Nothing is deleted.`, 'Reject'))) return;
    mark(tids, true);
    const done: string[] = [];
    for (const tid of tids) await rejectTrack(tid).then(() => done.push(tid), () => undefined);
    mark(tids, false);
    finish(done);
    toast(done.length === tids.length ? `Moved “${name}” to Rejected` : `Rejected ${done.length} of ${tids.length}`);
  };

  const pickSingleArt = (tid: string, art: PickedArt) => {
    setCoverNow((c) => ({ ...c, [tid]: pickedPreview(art, tid) }));
    void setTrackArt(tid, art)
      .then(() => q.refetch())
      .then(() => toast('Cover saved'))
      .catch((e: unknown) => {
        setCoverNow((c) => {
          const n = { ...c };
          delete n[tid];
          return n;
        });
        toast(`Couldn’t use that cover: ${e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
      });
  };

  const autoFill = (r: Release) => {
    const key = r.kind === 'album' ? r.key : null;
    const songs = tidsOf(r).map((tid) => {
      const d = drafts[tid];
      const t = byTid.get(tid);
      const a = key ? albums[key] : null;
      return {
        key: tid,
        artist: d.artist[0] || fileUnder,
        title: d.title,
        album: a ? a.album : d.album,
        length: t?.length ?? 0,
        coverPx: key ? (a?.art ? 1000 : Math.min(t?.aw ?? 0, t?.ah ?? 0)) : Math.min(t?.aw ?? 0, t?.ah ?? 0),
        now: {
          date: a ? a.date : d.date,
          tracknumber: d.tracknumber,
          discnumber: d.discnumber,
          album: a ? a.album : d.album,
          albumartist: a ? a.albumartist : d.albumartist,
          releasetype: a ? a.releasetype : d.releasetype,
          genre: (a ? a.genre : d.genre).join(', '),
        },
      };
    });
    autoFillDialog(songs, (changes: FillChanges) => {
      let albumArt: string | undefined;
      for (const [tid, { set, cover }] of changes) {
        const own: Partial<Draft> = {};
        const forAlbum: Partial<AlbumDraft> = {};
        for (const [f, v] of Object.entries(set)) {
          const val = v as string | string[];
          if (key && ['album', 'albumartist', 'date', 'releasetype', 'genre'].includes(f)) Object.assign(forAlbum, { [f]: val });
          else Object.assign(own, { [f]: val });
        }
        if (Object.keys(own).length) setDraft(tid, own);
        if (key && Object.keys(forAlbum).length) setAlbum(key, forAlbum);
        if (cover) {
          if (key) albumArt ??= cover;
          else pickSingleArt(tid, { url: cover });
        }
      }
      if (key && albumArt) setAlbum(key, { art: { url: albumArt } });
      toast(`Filled in ${changes.size} ${changes.size === 1 ? 'song' : 'songs'}. Check, then Send`);
    }, 'queue');
  };

  const addTo = (r: Release, album?: LibraryAlbum) => {
    if (!group) return;
    const key = r.kind === 'album' ? r.key : null;
    const tids = tidsOf(r);
    const items = tids.map((tid) => ({ id: tid, data: dataFor(tid, key) as SendData }));
    showDialog(<AddToAlbum group={group} items={items} start={album} name={(key ? albums[key]?.album : drafts[tids[0]]?.album) ?? ''} onDone={(sent) => finish(sent)} />);
  };

  const ctx: Ctx = {
    gid,
    group: group as GroupDetail,
    byTid,
    drafts,
    setDraft,
    albums,
    setAlbum,
    busy,
    send: (r) => void send(r),
    save: (r) => void save(r),
    reject: (r) => void reject(r),
    detach: (tid) => setMember((m) => ({ ...m, [tid]: null })),
    ungroup: (key) => setMember((m) => Object.fromEntries(Object.entries(m).map(([t, k]) => [t, k === key ? null : k]))),
    autoFill,
    addTo,
    coverNow,
    pickSingleArt,
    fileUnder,
  };

  if (q.isError) return <Empty icon={Disc3} title="Couldn’t Load This Artist" detail={q.error instanceof Error ? q.error.message : ''} action={{ label: 'Try Again', run: () => void q.refetch() }} />;

  const known = !!group?.artist_match;
  const genres = (group?.existing_genres ?? []).filter((g) => g.length > 1 && !/&$/.test(g));
  const fillEmpty = (g: string) => {
    let n = 0;
    for (const r of releases) {
      if (r.kind === 'album') {
        if (!albums[r.key].genre.length) (setAlbum(r.key, { genre: [g] }), n++);
      } else if (!drafts[r.tid].genre.length) (setDraft(r.tid, { genre: [g] }), n++);
    }
    toast(n ? `Added ${g} to ${n} empty genre ${n === 1 ? 'box' : 'boxes'}` : 'Every release has genres already');
  };

  return (
    <div className="tg-artist">
      <header {...revealWith('tg-artist-head', head)}>
        <div>
          <h2>{group?.artist ?? <Bar width={180} as="span" />}</h2>
          <p className="muted small">
            {live.length} {live.length === 1 ? 'song' : 'songs'} waiting · {known ? 'In your library' : 'New artist: a new folder is made'}
          </p>
        </div>
        <label className="tg-under">
          <span className="field-label">File Under</span>
          <ArtistField
            value={fileUnder}
            label="File Under"
            onChange={(v) => {
              const was = fileUnder;
              setFileUnder(v);
              // Album artists that followed the old name follow the new one.
              setDrafts((d) => Object.fromEntries(Object.entries(d).map(([t, x]) => [t, x.albumartist === was ? { ...x, albumartist: v } : x])));
              setAlbums((a) => Object.fromEntries(Object.entries(a).map(([k, x]) => [k, x.albumartist === was ? { ...x, albumartist: v } : x])));
            }}
          />
        </label>
        <button className="secondary small" onClick={() => releases.forEach((r) => autoFill(r))} disabled={!releases.length} title="Look every release up online">
          <Sparkles size={15} /> Auto-Fill All
        </button>
      </header>
      {genres.length ? (
        <div className="tg-known-genres">
          <span className="muted small">Their genres in your library:</span>
          {genres.slice(0, 14).map((g) => (
            <button key={g} className="chip" title="Add to every release without genres" onClick={() => fillEmpty(g)}>
              {g}
            </button>
          ))}
        </div>
      ) : null}
      <div className="tg-releases">
        {!group
          ? Array.from({ length: 2 }, (_, i) => <div key={i} className="tg-card skel-card" />)
          : releases.map((r) => (r.kind === 'album' ? <AlbumCard key={r.key} r={r} ctx={ctx} /> : <SingleCard key={r.tid} tid={r.tid} ctx={ctx} />))}
      </div>
    </div>
  );
}

// ---- Cards ----

function cardKeys(e: ReactKeyboardEvent, ctx: Ctx, r: Release) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    ctx.send(r);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    ctx.save(r);
  }
}

function PlayButton({ tid, label }: { tid: string; label: string }) {
  const on = usePreview((s) => s.tid === tid && s.playing);
  return (
    <button type="button" className={`tg-icon-btn${on ? ' on' : ''}`} aria-label={on ? `Pause ${label}` : `Play ${label}`} title={on ? 'Pause' : 'Listen'} onClick={() => togglePreview(tid)}>
      {on ? <Pause size={16} /> : <Play size={16} />}
    </button>
  );
}

function FeatHint({ d, onFix }: { d: Draft; onFix(p: Partial<Draft>): void }) {
  const known = useLibraryArtists().data;
  const f = featMissing(d.title, d.artist, known);
  if (!f) return null;
  return (
    <span className="tg-hint">
      The title credits {f.missing.join(', ')}.{' '}
      <button type="button" className="tg-linkbtn" onClick={() => onFix({ artist: [...d.artist, ...f.missing], title: f.rest })}>
        Move to Artists
      </button>{' '}
      <button type="button" className="tg-linkbtn" onClick={() => onFix({ artist: [...d.artist, ...f.missing] })}>
        Add, Keep Title
      </button>
    </span>
  );
}

function TypeSelect({ value, onChange, label = 'Release Type' }: { value: string; onChange(v: string): void; label?: string }) {
  const list = value && !RELEASE_TYPES.includes(value) ? [value, ...RELEASE_TYPES] : RELEASE_TYPES;
  return (
    <select className="field select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {list.map((t) => (
        <option key={t}>{t}</option>
      ))}
    </select>
  );
}

function Field({ label, children, wide, narrow }: { label: string; children: React.ReactNode; wide?: boolean; narrow?: boolean }) {
  return (
    <label className={`tg-field${wide ? ' wide' : ''}${narrow ? ' narrow' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function LookUpGenres({ artist, album, onAdd }: { artist: string; album: string; onAdd(g: string[]): void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="tg-linkbtn"
      disabled={busy || !artist}
      title="Genres from MusicBrainz, Discogs and Last.fm"
      onClick={() => {
        setBusy(true);
        rymTags(artist, album)
          .then((g) => (g.length ? onAdd(g) : toast(`No genres found for ${artist}`)))
          .catch(() => toast('The genre look-up failed'))
          .finally(() => setBusy(false));
      }}>
      <Sparkles size={13} /> {busy ? 'Looking…' : 'Look Up'}
    </button>
  );
}

function SpotifyInput({ value, had, onChange, label, compact }: { value: string; had: string; onChange(v: string): void; label: string; compact?: boolean }) {
  const bad = spotifyOut(value, had) === null;
  return (
    <input
      className={`field${bad ? ' invalid' : ''}${compact ? ' sm' : ''}`}
      value={value}
      aria-label={label}
      title={bad ? 'That isn’t a Spotify song link' : 'Spicy Lyrics finds word-synced lyrics by this link'}
      placeholder={compact ? 'open.spotify.com/track/…' : 'Paste the song’s link from Spotify'}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SingleCard({ tid, ctx }: { tid: string; ctx: Ctx }) {
  const d = ctx.drafts[tid];
  const t = ctx.byTid.get(tid);
  if (!d || !t) return null;
  const r: Release = { kind: 'single', tid };
  const set = (p: Partial<Draft>) => ctx.setDraft(tid, p);
  const busy = ctx.busy.has(tid);
  const inLibrary = ctx.group.library_albums?.find((a) => d.album && sameAlbum(a.album, d.album));
  const more = (e: React.MouseEvent) =>
    openMenu(
      e,
      [
        { label: 'Auto-Fill', icon: Sparkles, run: () => ctx.autoFill(r) },
        { label: 'Add to an Album in Your Library', icon: Disc3, run: () => ctx.addTo(r) },
        { label: 'Save, Keep in Inbox', icon: Check, run: () => ctx.save(r) },
        { label: 'Reject', icon: Trash2, danger: true, divider: true, run: () => ctx.reject(r) },
      ],
      d.title,
    );
  return (
    <article className={`tg-card${busy ? ' busy' : ''}`} onKeyDown={(e) => cardKeys(e, ctx, r)} aria-label={d.title}>
      <div className="tg-card-side">
        <CoverBox
          src={ctx.coverNow[tid] ?? (t.art ? artUrl(tid, t.mt, 320) : null)}
          info={t.art ? { w: t.aw, h: t.ah, bytes: t.ab } : null}
          onPick={(art) => ctx.pickSingleArt(tid, art)}
          search={`${d.artist[0] ?? ctx.fileUnder} ${d.album || d.title}`}
          folderTid={tid}
        />
        <div className="tg-card-file muted small" title={t.file}>
          <PlayButton tid={tid} label={d.title} />
          <span className="ellipsis">
            {fmtLength(t.length)} · {t.ext.toUpperCase()}
          </span>
          <button type="button" className={`tg-icon-btn${d.favorite ? ' on' : ''}`} aria-pressed={d.favorite} title="Like it once it's in Jellyfin" aria-label="Like" onClick={() => set({ favorite: !d.favorite })}>
            <Heart size={16} fill={d.favorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
      <div className="tg-card-body">
        <div className="tg-grid">
          <Field label="Title" wide>
            <input className="field" value={d.title} onChange={(e) => set({ title: e.target.value })} spellCheck={false} aria-label="Title" />
            <FeatHint d={d} onFix={set} />
          </Field>
          <Field label="Artists" wide>
            <Chips kind="artist" values={d.artist} onChange={(v) => set({ artist: v })} label="Artists" />
          </Field>
          <Field label="Album Artist">
            <ArtistField value={d.albumartist} onChange={(v) => set({ albumartist: v })} label="Album Artist" />
          </Field>
          <Field label="Album">
            <input className="field" value={d.album} onChange={(e) => set({ album: e.target.value })} placeholder={d.title} spellCheck={false} aria-label="Album" />
          </Field>
          <Field label="Year" narrow>
            <input className="field" value={d.date} onChange={(e) => set({ date: e.target.value })} inputMode="numeric" aria-label="Year" />
          </Field>
          <Field label="Track" narrow>
            <input className="field" value={d.tracknumber} onChange={(e) => set({ tracknumber: e.target.value })} aria-label="Track" />
          </Field>
          <Field label="Type" narrow>
            <TypeSelect value={d.releasetype || 'Single'} onChange={(v) => set({ releasetype: v })} />
          </Field>
          <Field label="Genres" wide>
            <Chips kind="genre" values={d.genre} onChange={(v) => set({ genre: v })} />
            <span className="tg-under-field">
              <LookUpGenres artist={d.artist[0] || ctx.fileUnder} album={d.album} onAdd={(g) => set({ genre: [...d.genre, ...g.filter((x) => !d.genre.includes(x))] })} />
              {inLibrary ? (
                <span className="tg-hint">
                  “{inLibrary.album}” is in your library.{' '}
                  <button type="button" className="tg-linkbtn" onClick={() => ctx.addTo(r, inLibrary)}>
                    Add to It
                  </button>
                </span>
              ) : null}
            </span>
          </Field>
          <Field label="Composer">
            <input className="field" value={d.composer} onChange={(e) => set({ composer: e.target.value })} spellCheck={false} aria-label="Composer" />
          </Field>
          <Field label="Spotify Link" wide>
            <SpotifyInput value={d.spotify} had={t.spotifyid} onChange={(v) => set({ spotify: v })} label="Spotify Link" />
          </Field>
        </div>
        <div className="tg-card-actions">
          <button type="button" className="tg-icon-btn" aria-label="More" title="More" onClick={more}>
            <Ellipsis size={18} />
          </button>
          <button type="button" className="secondary small" onClick={() => ctx.autoFill(r)}>
            <Sparkles size={15} /> Auto-Fill
          </button>
          <span className="tg-flex" />
          <button type="button" className="secondary small" onClick={() => ctx.reject(r)} disabled={busy}>
            Reject
          </button>
          <button type="button" className="secondary small" onClick={() => ctx.save(r)} disabled={busy} title="Write the tags now and keep it in the inbox (Ctrl+S)">
            Save
          </button>
          <button type="button" className="primary small" onClick={() => ctx.send(r)} disabled={busy} title="Write the tags and file it into your library (Ctrl+Enter)">
            {busy ? 'Working…' : 'Send to Library'}
          </button>
        </div>
      </div>
    </article>
  );
}

/** Album names match when they differ only by case, "Disc 2" or a Deluxe / Remaster / Edition note. */
const albumKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*[([][^)\]]*(deluxe|remaster|edition|version|disc\s*\d+|cd\s*\d+)[^)\]]*[)\]]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
const sameAlbum = (a: string, b: string) => albumKey(a) === albumKey(b);

function AlbumCard({ r, ctx }: { r: Extract<Release, { kind: 'album' }>; ctx: Ctx }) {
  const a = ctx.albums[r.key];
  if (!a) return null;
  const set = (p: Partial<AlbumDraft>) => ctx.setAlbum(r.key, p);
  const busy = r.tids.some((t) => ctx.busy.has(t));
  const discs = new Set(r.tids.map((t) => discOf(ctx.drafts[t]))).size > 1;
  const first = r.tids.find((t) => ctx.byTid.get(t)?.art);
  const firstTrack = first ? ctx.byTid.get(first) : undefined;
  const inLibrary = ctx.group.library_albums?.find((x) => sameAlbum(x.album, a.album));
  const feats = r.tids.filter((t) => featMissing(ctx.drafts[t].title, ctx.drafts[t].artist));
  const setAll = (p: Partial<Draft>) => r.tids.forEach((t) => ctx.setDraft(t, p));
  const links = () =>
    spotifyLinksDialog(
      r.tids.map((t) => ({ key: t, title: ctx.drafts[t].title, n: trackNo(ctx.drafts[t].tracknumber), length: ctx.byTid.get(t)?.length ?? 0, has: spotifyId(ctx.drafts[t].spotify) })),
      (ids, link) => {
        for (const [t, id] of ids) ctx.setDraft(t, { spotify: spotifyLink(id) });
        set({ link });
        toast(`Filled in ${ids.size} Spotify ${ids.size === 1 ? 'link' : 'links'}. They're written when you send`);
      },
      a.link,
    );
  const more = (e: React.MouseEvent) =>
    openMenu(
      e,
      [
        { label: 'Spotify Links From the Album', icon: Search, run: links },
        { label: 'Auto-Fill', icon: Sparkles, run: () => ctx.autoFill(r) },
        ...(feats.length
          ? [
              {
                label: `Move feat. Into Artists (${feats.length})`,
                icon: Check,
                run: () =>
                  feats.forEach((t) => {
                    const f = featMissing(ctx.drafts[t].title, ctx.drafts[t].artist);
                    if (f) ctx.setDraft(t, { artist: [...ctx.drafts[t].artist, ...f.missing], title: f.rest });
                  }),
              },
            ]
          : []),
        { label: 'Number in This Order', icon: Check, run: () => r.tids.forEach((t, i) => ctx.setDraft(t, { tracknumber: `${i + 1}/${r.tids.length}` })) },
        { label: 'Add to an Album in Your Library', icon: Disc3, run: () => ctx.addTo(r) },
        { label: 'Split Into Singles', icon: X, run: () => ctx.ungroup(r.key) },
        { label: 'Save, Keep in Inbox', icon: Check, divider: true, run: () => ctx.save(r) },
        { label: 'Reject the Album', icon: Trash2, danger: true, run: () => ctx.reject(r) },
      ],
      a.album,
    );
  return (
    <article className={`tg-card album${busy ? ' busy' : ''}`} onKeyDown={(e) => cardKeys(e, ctx, r)} aria-label={a.album}>
      <div className="tg-card-side">
        <CoverBox
          src={a.art ? pickedPreview(a.art, r.tids[0]) : first ? artUrl(first, firstTrack?.mt, 320) : null}
          info={!a.art && firstTrack ? { w: firstTrack.aw, h: firstTrack.ah, bytes: firstTrack.ab } : null}
          onPick={(art) => set({ art })}
          search={`${a.albumartist} ${a.album}`}
          folderTid={r.tids[0]}
        />
        {a.art ? <span className="muted small">New cover: written to every song when sent</span> : null}
      </div>
      <div className="tg-card-body">
        {inLibrary ? (
          <div className="tg-banner">
            <Disc3 size={16} /> “{inLibrary.album}” ({inLibrary.date || 'no year'}, {inLibrary.tracks} songs) is already in your library.
            <button type="button" className="secondary small" onClick={() => ctx.addTo(r, inLibrary)}>
              Add to This Album
            </button>
          </div>
        ) : null}
        <div className="tg-grid">
          <Field label="Album" wide>
            <input className="field" value={a.album} onChange={(e) => set({ album: e.target.value })} spellCheck={false} aria-label="Album" />
          </Field>
          <Field label="Album Artist">
            <ArtistField value={a.albumartist} onChange={(v) => set({ albumartist: v })} label="Album Artist" />
          </Field>
          <Field label="Year" narrow>
            <input className="field" value={a.date} onChange={(e) => set({ date: e.target.value })} inputMode="numeric" aria-label="Year" />
          </Field>
          <Field label="Type" narrow>
            <TypeSelect value={a.releasetype || 'Album'} onChange={(v) => set({ releasetype: v })} />
          </Field>
          <Field label="Genres" wide>
            <Chips kind="genre" values={a.genre} onChange={(v) => set({ genre: v })} />
            <span className="tg-under-field">
              <LookUpGenres artist={a.albumartist} album={a.album} onAdd={(g) => set({ genre: [...a.genre, ...g.filter((x) => !a.genre.includes(x))] })} />
            </span>
          </Field>
        </div>
        <div className={`tg-tracks${discs ? ' discs' : ''}`} role="table" aria-label="Songs">
          <div className="tg-track head" role="row">
            <span />
            {discs ? <span>Disc</span> : null}
            <span>#</span>
            <span>Title</span>
            <span>Artists</span>
            <span>Spotify Link</span>
            <span />
          </div>
          {r.tids.map((tid) => {
            const d = ctx.drafts[tid];
            const t = ctx.byTid.get(tid);
            const s = (p: Partial<Draft>) => ctx.setDraft(tid, p);
            return (
              <div key={tid} className="tg-track" role="row">
                <PlayButton tid={tid} label={d.title} />
                {discs ? <input className="field sm" value={d.discnumber} onChange={(e) => s({ discnumber: e.target.value })} aria-label={`Disc, ${d.title}`} /> : null}
                <input className="field sm" value={d.tracknumber} onChange={(e) => s({ tracknumber: e.target.value })} aria-label={`Track, ${d.title}`} />
                <span className="tg-cell">
                  <input className="field sm" value={d.title} onChange={(e) => s({ title: e.target.value })} spellCheck={false} aria-label={`Title, ${d.title}`} />
                  <FeatHint d={d} onFix={s} />
                </span>
                <Chips kind="artist" compact values={d.artist} onChange={(v) => s({ artist: v })} label={`Artists, ${d.title}`} placeholder={a.albumartist} />
                <SpotifyInput compact value={d.spotify} had={t?.spotifyid ?? ''} onChange={(v) => s({ spotify: v })} label={`Spotify Link, ${d.title}`} />
                <span className="tg-track-end">
                  <button type="button" className={`tg-icon-btn${d.favorite ? ' on' : ''}`} aria-pressed={d.favorite} aria-label={`Like ${d.title}`} title="Like it once it's in Jellyfin" onClick={() => s({ favorite: !d.favorite })}>
                    <Heart size={15} fill={d.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button type="button" className="tg-icon-btn" aria-label={`Take ${d.title} out of the album`} title="Take out of the album" onClick={() => ctx.detach(tid)}>
                    <X size={15} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        <div className="tg-setall">
          <span className="muted small">On every song:</span>
          <SetAll label="Artists" onSet={(v) => setAll({ artist: splitValues(v) })} />
          <SetAll label="Composer" onSet={(v) => setAll({ composer: v })} />
          <SetAll label="Disc" onSet={(v) => setAll({ discnumber: v })} />
        </div>
        <div className="tg-card-actions">
          <button type="button" className="tg-icon-btn" aria-label="More" title="More" onClick={more}>
            <Ellipsis size={18} />
          </button>
          <button type="button" className="secondary small" onClick={links}>
            Spotify Links
          </button>
          <button type="button" className="secondary small" onClick={() => ctx.autoFill(r)}>
            <Sparkles size={15} /> Auto-Fill
          </button>
          <span className="tg-flex" />
          <button type="button" className="secondary small" onClick={() => ctx.reject(r)} disabled={busy}>
            Reject
          </button>
          <button type="button" className="secondary small" onClick={() => ctx.save(r)} disabled={busy} title="Write the tags now and keep it in the inbox (Ctrl+S)">
            Save
          </button>
          <button type="button" className="primary small" onClick={() => ctx.send(r)} disabled={busy} title="Write the tags and file the album into your library (Ctrl+Enter)">
            {busy ? 'Working…' : `Send Album (${r.tids.length})`}
          </button>
        </div>
      </div>
    </article>
  );
}

function SetAll({ label, onSet }: { label: string; onSet(v: string): void }) {
  const [v, setV] = useState('');
  return (
    <form
      className="tg-setall-one"
      onSubmit={(e) => {
        e.preventDefault();
        onSet(v);
        setV('');
      }}>
      <input className="field sm" value={v} onChange={(e) => setV(e.target.value)} placeholder={label} aria-label={`${label} on every song`} spellCheck={false} />
      <button className="secondary small" disabled={!v.trim()}>
        Set
      </button>
    </form>
  );
}

// ---- Send anyway? ----

function sendAnyway(name: string, warnings: Warning[]): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      closeDialog();
      resolve(v);
    };
    showDialog(
      <div className="tg-dialog">
        <h2 className="dialog-title">Send “{name}”?</h2>
        <p className="muted">MRQ noticed {warnings.length === 1 ? 'something' : `${warnings.length} things`} worth a look first:</p>
        <ul className="tg-warnings">
          {warnings.map((w, i) => (
            <li key={i} className={w.level === 'error' ? 'bad' : ''}>
              <b>{w.msg}</b>
              {w.detail ? <span className="muted small"> {w.detail}</span> : null}
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => done(false)} autoFocus>
            Go Back
          </button>
          <button className="primary" onClick={() => done(true)}>
            Send Anyway
          </button>
        </div>
      </div>,
    );
  });
}

// ---- Add to an album that's already in the library ----

function AddToAlbum({ group, items, start, name, onDone }: { group: GroupDetail; items: { id: string; data: SendData }[]; start?: LibraryAlbum; name: string; onDone(sent: string[]): void }) {
  const [album, setAlbum] = useState<LibraryAlbum | null>(start ?? null);
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<LibraryAlbum[] | null>(null);
  const [preview, setPreview] = useState<AddPreview | null>(null);
  const [error, setError] = useState('');
  const [genres, setGenres] = useState<'album' | 'keep'>('album');
  const [rename, setRename] = useState(true);
  const [type, setType] = useState('');
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const firstPreview = useRef(true);

  const mine = group.library_albums ?? [];
  useEffect(() => {
    if (!term.trim()) return setFound(null);
    const id = setTimeout(() => {
      libraryAlbums({ q: term.trim(), limit: 40 })
        .then((r) => setFound(r.albums))
        .catch(() => setFound([]));
    }, 220);
    return () => clearTimeout(id);
  }, [term]);

  const body = (all: boolean) => ({ album: album?.rel ?? '', tracks: items.filter((i) => all || !skip.has(i.id)), genres, rename, releasetype: type });
  useEffect(() => {
    if (!album) return;
    setError('');
    addToAlbumPreview(body(true))
      .then((p) => {
        setPreview(p);
        if (firstPreview.current) {
          firstPreview.current = false;
          // A song whose title is already in the album is left out unless you tick it.
          setSkip(new Set(p.plan.filter((x) => x.dup === 'title').map((x) => x.id)));
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'MRQ didn’t answer'));
  }, [album, genres, rename, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = () => {
    setBusy(true);
    addToAlbum(body(false))
      .then((r) => {
        const sent = r.results.filter((x) => x.ok).map((x) => x.id);
        closeDialog();
        onDone(sent);
        toast(`Added ${sent.length} ${sent.length === 1 ? 'song' : 'songs'} to “${album?.album}”`);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'MRQ didn’t answer'))
      .finally(() => setBusy(false));
  };

  if (!album) {
    const list = found ?? mine;
    return (
      <div className="tg-dialog">
        <h2 className="dialog-title">Add to an Album in Your Library</h2>
        <p className="muted small">The songs take the album’s name, artist, year, type, genres and cover, and go into its folder. The songs already there aren’t touched.</p>
        <input className="field" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={`Search every album (${group.artist}’s are below)`} aria-label="Search albums" spellCheck={false} autoFocus />
        <div className="tg-album-pick">
          {list.map((a) => (
            <button key={a.rel} className={`tg-album-row${sameAlbum(a.album, name) ? ' match' : ''}`} onClick={() => setAlbum(a)}>
              <img src={artUrl(a.cover, a.mt, 64)} alt="" className="tg-thumb" draggable={false} />
              <span className="ellipsis">
                <b>{a.album}</b>
                <span className="muted small">
                  {' '}
                  · {a.albumartist} · {a.date || 'no year'} · {a.releasetype || 'no type'} · {a.tracks} songs
                </span>
              </span>
            </button>
          ))}
          {!list.length ? <p className="muted">{found ? 'No album matches.' : `None of ${group.artist}’s albums are in the library yet. Search for one.`}</p> : null}
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={closeDialog}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const adding = preview?.plan.filter((p) => !skip.has(p.id)).length ?? 0;
  return (
    <div className="tg-dialog tg-add">
      <h2 className="dialog-title">Add to “{album.album}”</h2>
      <p className="muted small">
        {album.albumartist} · {album.date || 'no year'} · {album.folder}
      </p>
      <div className="tg-add-opts">
        <label className="tg-check">
          <input type="checkbox" checked={genres === 'album'} onChange={(e) => setGenres(e.target.checked ? 'album' : 'keep')} />
          Use the Album’s Genres
        </label>
        <label className="tg-check">
          <input type="checkbox" checked={rename} onChange={(e) => setRename(e.target.checked)} />
          Name Files Like the Album’s
        </label>
        <label className="tg-check">
          Release Type
          <select className="field select sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Release Type">
            <option value="">Keep ({preview?.album_type || album.releasetype || 'none'})</option>
            {RELEASE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      {preview?.new_folder ? (
        <p className={`tg-hint${preview.blocked ? ' bad' : ''}`}>
          {preview.blocked
            ? `A folder called “${preview.new_folder}” already exists, so the type can’t change.`
            : `The folder becomes “${preview.new_folder}”. Jellyfin then sees the songs already in it as new: their plays, likes and date added start over.`}
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="tg-plan">
        {preview?.plan.map((p) => (
          <label key={p.id} className={`tg-plan-row${skip.has(p.id) ? ' off' : ''}`}>
            <input
              type="checkbox"
              checked={!skip.has(p.id)}
              onChange={(e) =>
                setSkip((s) => {
                  const n = new Set(s);
                  if (e.target.checked) n.delete(p.id);
                  else n.add(p.id);
                  return n;
                })
              }
            />
            <span className="ellipsis">{p.name}</span>
            {p.dup ? <span className="tg-badge warn">{p.dup === 'title' ? 'Already in the album' : 'Number taken'}</span> : null}
          </label>
        )) ?? Array.from({ length: Math.min(items.length, 4) }, (_, i) => <span key={i} className="tg-plan-row skel-line" />)}
      </div>
      {preview?.warnings.filter((w) => w.kind !== 'dup-title' && w.kind !== 'dup-number').map((w, i) => (
        <p key={i} className="tg-hint">
          {w.msg}
        </p>
      ))}
      {preview?.existing.length ? (
        <details className="tg-existing">
          <summary className="muted small">Already in the album ({preview.existing.length})</summary>
          {preview.existing.map((x, i) => (
            <span key={i} className="muted small">
              {x.n}. {x.title}
            </span>
          ))}
        </details>
      ) : null}
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={() => (start ? closeDialog() : (setAlbum(null), setPreview(null)))}>
          {start ? 'Cancel' : 'Back'}
        </button>
        <button className="primary" disabled={busy || !adding || !!preview?.blocked} onClick={go}>
          {busy ? 'Adding…' : `Add ${adding} ${adding === 1 ? 'Song' : 'Songs'}`}
        </button>
      </div>
    </div>
  );
}
