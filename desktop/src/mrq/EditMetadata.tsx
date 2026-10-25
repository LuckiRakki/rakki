// Edit Metadata (right-click a song or an album): change the tags in the files themselves,
// through MRQ (mrq/client.ts), like MRQ's own Tag Editor.
// - Songs: one song has every field, its Spotify link included. Several songs are a batch edit:
//   a field they disagree on shows how many values it has and is left alone unless you type in it.
// - An album: its own fields once (album, album artists, genres, year, cover), then a row per
//   song (number, title, artists, Spotify link). Pasting the album's Spotify link fills in every
//   song's link (matched by title, else by place in the album), to check before saving.
// Save closes the dialog at once; the new names show straight away and a toast says how it went
// once MRQ has written the files and Jellyfin has been asked to read them again.
import { useEffect, useMemo, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { songsOf, patchItem } from '~/library/actions';
import { matchAlbum, MrqError, saveTags, spotifyAlbum, spotifyId, spotifyIdsOf, spotifyLink, withPaths, type TagChanges } from '~/mrq/client';
import { usePlayer } from '~/player/store';
import { queryClient } from '~/queries';
import { ImagePlus } from '~/ui/icons';
import { closeDialog, showDialog, toast } from '~/ui/overlays';
import { Artwork, showLocalPicture } from '~/ui/parts';

type Key = 'title' | 'artist' | 'album' | 'albumartist' | 'date' | 'genre' | 'tracknumber' | 'discnumber';

interface Field {
  key: Key;
  label: string;
  /** Lists (artists, genres): typed with ; between them. */
  list?: boolean;
  /** Only for one song (a title or track number shared by several makes no sense). */
  single?: boolean;
  narrow?: boolean;
  read(s: BaseItem): string;
}

const join = (v?: (string | undefined)[]) => (v ?? []).filter(Boolean).join('; ');

const FIELDS: Field[] = [
  { key: 'title', label: 'Title', single: true, read: (s) => s.Name ?? '' },
  { key: 'artist', label: 'Artists', list: true, read: (s) => join(s.Artists) },
  { key: 'album', label: 'Album', read: (s) => s.Album ?? '' },
  { key: 'albumartist', label: 'Album Artists', list: true, read: (s) => join(s.AlbumArtists?.map((a) => a.Name)) || (s.AlbumArtist ?? '') },
  { key: 'genre', label: 'Genres', list: true, read: (s) => join(s.Genres) },
  { key: 'date', label: 'Year', narrow: true, read: (s) => (s.ProductionYear ? String(s.ProductionYear) : '') },
  { key: 'tracknumber', label: 'Track', single: true, narrow: true, read: (s) => (s.IndexNumber ? String(s.IndexNumber) : '') },
  { key: 'discnumber', label: 'Disc', narrow: true, read: (s) => (s.ParentIndexNumber ? String(s.ParentIndexNumber) : '') },
];
const field = (k: Key) => FIELDS.find((f) => f.key === k)!;

/** The album's own fields in the album editor (the rest are per song there). */
const ALBUM_KEYS: Key[] = ['album', 'albumartist', 'genre', 'date'];

/** Artists split on ; (also / and |, as MRQ does), genres also on commas. */
function toList(key: Key, v: string): string[] {
  const split = key === 'genre' ? /[;,|]/ : /[;|]|\s\/\s/;
  return v
    .split(split)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** One value for every song, or null when they differ. */
function shared(songs: BaseItem[], f: Field): { value: string | null; count: number } {
  const values = new Set(songs.map(f.read));
  return { value: values.size === 1 ? [...values][0] : null, count: values.size };
}

/** Album order: disc, then track, then name. */
const albumOrder = (a: BaseItem, b: BaseItem) =>
  (a.ParentIndexNumber ?? 1) - (b.ParentIndexNumber ?? 1) || (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0) || (a.Name ?? '').localeCompare(b.Name ?? '');

export function openEditMetadata(items: BaseItem[]) {
  const album = items.length === 1 && items[0].Type === 'MusicAlbum' ? items[0] : null;
  void Promise.all(items.map(songsOf)).then((lists) => {
    const songs = lists.flat().filter((s) => s.Type === 'Audio');
    if (!songs.length) return;
    showDialog(album ? <AlbumEditor album={album} songs={songs.sort(albumOrder)} /> : <SongsEditor songs={songs} />);
  });
}

// ---- Shared pieces ----

/** Jellyfin's current values with each file's location (and genres, which lists leave out), then the Spotify links MRQ has. */
function useSongs(given: BaseItem[]) {
  const [songs, setSongs] = useState(given);
  const [links, setLinks] = useState<Map<string, string>>(new Map());
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    withPaths(given)
      .then(async (full) => {
        if (!alive || !full.length) return;
        setSongs(full.length === given.length ? full : given.map((g) => full.find((f) => f.Id === g.Id) ?? g));
        const ids = await spotifyIdsOf(full);
        if (alive) setLinks(ids);
      })
      .catch((e: unknown) => alive && setProblem(e instanceof Error ? e.message : 'Jellyfin didn’t answer.'));
    return () => {
      alive = false;
    };
  }, [given]);
  return { songs, links, problem };
}

function useCover() {
  const [cover, setCover] = useState<{ file: File; url: string } | null>(null);
  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) return toast('That picture is too big: pick one under 15 MB');
      setCover({ file, url: URL.createObjectURL(file) });
    };
    input.click();
  };
  return { cover, pick };
}

function Head({ item, cover, pick, title, line }: { item: BaseItem; cover: { url: string } | null; pick(): void; title: string; line: string }) {
  return (
    <div className="meta-head">
      <button type="button" className="meta-cover" onClick={pick} title="Change Cover" aria-label="Change Cover">
        {cover ? (
          <div className="artwork">
            <img src={cover.url} alt="" />
          </div>
        ) : (
          <Artwork item={item} size={200} />
        )}
        <span className="meta-cover-hint">
          <ImagePlus size={20} />
        </span>
      </button>
      <div style={{ minWidth: 0 }}>
        <h2 className="dialog-title">{title}</h2>
        <p className="muted ellipsis">{line}</p>
        <p className="muted small">Written to the files by MRQ.{cover ? ' New cover picked.' : ''}</p>
      </div>
    </div>
  );
}

/** Typed values of the shared fields → what changes (a mixed field only when typed in). */
function sharedChanges(fields: Field[], start: Record<string, { value: string | null }>, typed: Partial<Record<Key, string>>): TagChanges {
  const out: Record<string, string | string[]> = {};
  for (const f of fields) {
    if (typed[f.key] === undefined) continue;
    const now = (typed[f.key] ?? '').trim();
    const was = start[f.key].value;
    if (was === null ? now === '' : now === was.trim()) continue;
    out[f.key] = f.list ? toList(f.key, now) : now;
  }
  return out as TagChanges;
}

/** A Spotify link typed in, against what the file has: undefined = no change, null = not a link. */
function linkChange(typed: string | undefined, had: string | undefined): string | null | undefined {
  if (typed === undefined) return undefined;
  const id = spotifyId(typed);
  if (typed.trim() && !id) return null;
  return id === (had ?? '') ? undefined : id;
}

function SharedFields({ fields, start, typed, setTyped, focus }: { fields: Field[]; start: Record<string, { value: string | null; count: number }>; typed: Partial<Record<Key, string>>; setTyped(f: (t: Partial<Record<Key, string>>) => Partial<Record<Key, string>>): void; focus?: Key }) {
  return (
    <>
      {fields.map((f) => {
        const s = start[f.key];
        const mixed = s.value === null;
        return (
          <label key={f.key} className={`meta-field${f.narrow ? ' narrow' : ''}`}>
            <span className="field-label">{f.label}</span>
            <input
              className="field"
              value={typed[f.key] ?? s.value ?? ''}
              placeholder={mixed ? `Keep (${s.count} different)` : f.list ? 'Separate with ;' : ''}
              inputMode={f.narrow ? 'numeric' : undefined}
              spellCheck={false}
              autoFocus={f.key === focus}
              onChange={(e) => setTyped((t) => ({ ...t, [f.key]: e.target.value }))}
            />
          </label>
        );
      })}
    </>
  );
}

/** Close, show the change everywhere at once, save behind the screen, say how it went. */
function saveAndReport(songs: BaseItem[], ch: TagChanges, each: Map<string, TagChanges>, cover: { file: File; url: string } | null, album?: BaseItem) {
  closeDialog();
  showChanges(songs, ch, each, cover?.url);
  if (album && ch.album !== undefined) patchItem(album.Id, (a) => ({ ...a, Name: ch.album ?? a.Name }));
  if (album && cover) showLocalPicture(album.Id, cover.url);
  void saveTags(songs, ch, cover?.file, each)
    .then(({ changed, failed }) => {
      // Jellyfin reads the files a moment after being asked; then every list shows what it has.
      setTimeout(() => void queryClient.invalidateQueries(), changed.length ? 4000 : 0);
      if (!failed.length) toast(changed.length === 1 ? 'Metadata saved' : `Metadata saved to ${changed.length} songs`);
      else if (!changed.length) toast(`Couldn’t save: ${failed[0].why}`);
      else toast(`Saved ${changed.length} of ${changed.length + failed.length} songs. ${failed[0].song.Name}: ${failed[0].why}`);
    })
    .catch((e: unknown) => {
      void queryClient.invalidateQueries();
      toast(`Couldn’t save: ${e instanceof MrqError || e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
    });
}

function Actions({ dirty }: { dirty: boolean }) {
  return (
    <div className="dialog-actions">
      <button type="button" className="secondary" onClick={closeDialog}>
        Cancel
      </button>
      <button className="primary" disabled={!dirty}>
        Save
      </button>
    </div>
  );
}

// ---- Songs ----

function SongsEditor({ songs: given }: { songs: BaseItem[] }) {
  const { songs, links, problem } = useSongs(given);
  const { cover, pick } = useCover();
  const one = songs.length === 1;
  const fields = FIELDS.filter((f) => one || !f.single);
  const start = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, shared(songs, f)])), [songs]); // eslint-disable-line react-hooks/exhaustive-deps
  const [typed, setTyped] = useState<Partial<Record<Key, string>>>({});
  const [link, setLink] = useState<string | undefined>(undefined);

  const first = songs[0];
  const had = one ? links.get(first.Id) : undefined;
  const spotify = one ? linkChange(link, had) : undefined;
  const changes = sharedChanges(fields, start, typed);
  const dirty = (Object.keys(changes).length > 0 || !!cover || typeof spotify === 'string') && spotify !== null;

  return (
    <form
      className="meta-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) saveAndReport(songs, typeof spotify === 'string' ? { ...changes, spotifyid: spotify } : changes, new Map(), cover);
      }}>
      <Head item={first} cover={cover} pick={pick} title="Edit Metadata" line={one ? `${first.Name} · ${first.Artists?.join(', ') ?? ''}` : `${songs.length} songs`} />
      {problem ? <p className="setting-detail error">{problem}</p> : null}
      <div className="meta-grid">
        <SharedFields fields={fields} start={start} typed={typed} setTyped={setTyped} focus={one ? 'title' : 'artist'} />
        {one ? (
          <label className="meta-field">
            <span className="field-label">Spotify Link</span>
            <input
              className={`field${spotify === null ? ' invalid' : ''}`}
              value={link ?? spotifyLink(had ?? '')}
              placeholder="Paste the song's link from Spotify (Share → Copy Song Link)"
              spellCheck={false}
              onChange={(e) => setLink(e.target.value)}
            />
            {spotify === null ? <span className="setting-detail error">That isn't a Spotify song link.</span> : null}
          </label>
        ) : null}
      </div>
      <Actions dirty={dirty} />
    </form>
  );
}

// ---- An album ----

/**
 * The album link you filled the songs from, remembered on this computer (MRQ keeps only each
 * song's link; files have no album link), so the album editor shows it next time.
 */
const ALBUM_LINKS = 'rakki.mrq.albumLinks';

function albumLinks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ALBUM_LINKS) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberAlbumLink(albumId: string, link: string) {
  try {
    localStorage.setItem(ALBUM_LINKS, JSON.stringify({ ...albumLinks(), [albumId]: link }));
  } catch {
    // Only a convenience.
  }
}

type RowKey = 'tracknumber' | 'discnumber' | 'title' | 'artist';
const ROW_FIELDS: Record<RowKey, Field> = { tracknumber: field('tracknumber'), discnumber: field('discnumber'), title: field('title'), artist: field('artist') };

function AlbumEditor({ album, songs: given }: { album: BaseItem; songs: BaseItem[] }) {
  const { songs, links, problem } = useSongs(given);
  const { cover, pick } = useCover();
  const fields = ALBUM_KEYS.map(field);
  const start = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, shared(songs, f)])), [songs]); // eslint-disable-line react-hooks/exhaustive-deps
  const [typed, setTyped] = useState<Partial<Record<Key, string>>>({});
  /** Per song: typed numbers, titles, artists and Spotify links. */
  const [rows, setRows] = useState<Record<string, Partial<Record<RowKey | 'spotify', string>>>>({});
  const discs = new Set(songs.map((s) => s.ParentIndexNumber ?? 1)).size > 1;
  const [albumLink, setAlbumLink] = useState(() => albumLinks()[album.Id] ?? '');
  const [matchNote, setMatchNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [matching, setMatching] = useState(false);

  const setRow = (id: string, k: RowKey | 'spotify', v: string) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: v } }));

  // Per-song changes, and whether any typed Spotify link isn't one.
  let invalid = false;
  const each = new Map<string, TagChanges>();
  for (const s of songs) {
    const typedRow = rows[s.Id] ?? {};
    const ch: Record<string, string | string[]> = {};
    for (const k of Object.keys(ROW_FIELDS) as RowKey[]) {
      const now = typedRow[k];
      if (now === undefined || now.trim() === ROW_FIELDS[k].read(s).trim()) continue;
      ch[k] = ROW_FIELDS[k].list ? toList(k, now) : now.trim();
    }
    const link = linkChange(typedRow.spotify, links.get(s.Id));
    if (link === null) invalid = true;
    else if (link !== undefined) ch.spotifyid = link;
    if (Object.keys(ch).length) each.set(s.Id, ch as TagChanges);
  }
  const changes = sharedChanges(fields, start, typed);
  const dirty = !invalid && (Object.keys(changes).length > 0 || each.size > 0 || !!cover);

  const fill = () => {
    setMatching(true);
    setMatchNote(null);
    void spotifyAlbum(albumLink)
      .then((sp) => {
        const found = matchAlbum(songs, sp);
        setRows((r) => {
          const next = { ...r };
          for (const [id, sid] of found) next[id] = { ...next[id], spotify: spotifyLink(sid) };
          return next;
        });
        const missing = songs.length - found.size;
        setMatchNote({
          text: `${sp.name || 'Spotify'}: ${found.size} of ${songs.length} songs matched${missing ? '. The rest are left as they were' : ''}. Check them, then Save.`,
          bad: found.size === 0,
        });
      })
      .catch((e: unknown) => setMatchNote({ text: e instanceof Error ? e.message : 'Spotify didn’t answer.', bad: true }))
      .finally(() => setMatching(false));
  };

  return (
    <form
      className="meta-edit meta-album"
      onSubmit={(e) => {
        e.preventDefault();
        if (!dirty) return;
        if (spotifyId(albumLink, 'album')) rememberAlbumLink(album.Id, albumLink.trim());
        saveAndReport(songs, changes, each, cover, album);
      }}>
      <Head item={album} cover={cover} pick={pick} title="Edit Album" line={`${album.Name} · ${songs.length} songs`} />
      {problem ? <p className="setting-detail error">{problem}</p> : null}
      <div className="meta-grid">
        <SharedFields fields={fields} start={start} typed={typed} setTyped={setTyped} focus="album" />
        <div className="meta-field">
          <span className="field-label">Spotify Album Link</span>
          <div className="row-form">
            <input
              className="field"
              value={albumLink}
              placeholder="Paste the album's link to fill in every song's"
              aria-label="Spotify Album Link"
              spellCheck={false}
              onChange={(e) => setAlbumLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (spotifyId(albumLink, 'album')) fill();
                }
              }}
            />
            <button type="button" className="secondary small" disabled={matching || !spotifyId(albumLink, 'album')} onClick={fill}>
              Fill Song Links
            </button>
          </div>
          {matchNote ? <span className={`setting-detail${matchNote.bad ? ' error' : ''}`}>{matchNote.text}</span> : null}
        </div>
      </div>
      <div className={`meta-tracks${discs ? ' discs' : ''}`} role="table" aria-label="Songs">
        <div className="meta-track head" role="row">
          {discs ? <span role="columnheader">Disc</span> : null}
          <span role="columnheader">#</span>
          <span role="columnheader">Title</span>
          <span role="columnheader">Artists</span>
          <span role="columnheader">Spotify Link</span>
        </div>
        {songs.map((s) => {
          const r = rows[s.Id] ?? {};
          const bad = linkChange(r.spotify, links.get(s.Id)) === null;
          const input = (k: RowKey, label: string, narrow?: boolean) => (
            <input
              className="field"
              aria-label={`${label}, ${s.Name}`}
              value={r[k] ?? ROW_FIELDS[k].read(s)}
              inputMode={narrow ? 'numeric' : undefined}
              spellCheck={false}
              onChange={(e) => setRow(s.Id, k, e.target.value)}
            />
          );
          return (
            <div key={s.Id} className="meta-track" role="row">
              {discs ? input('discnumber', 'Disc', true) : null}
              {input('tracknumber', 'Track', true)}
              {input('title', 'Title')}
              {input('artist', 'Artists')}
              <input
                className={`field${bad ? ' invalid' : ''}`}
                aria-label={`Spotify Link, ${s.Name}`}
                title={bad ? "That isn't a Spotify song link" : undefined}
                value={r.spotify ?? spotifyLink(links.get(s.Id) ?? '')}
                placeholder="open.spotify.com/track/…"
                spellCheck={false}
                onChange={(e) => setRow(s.Id, 'spotify', e.target.value)}
              />
            </div>
          );
        })}
      </div>
      <Actions dirty={dirty} />
    </form>
  );
}

/** The new names everywhere at once (Jellyfin catches up a moment later). */
function showChanges(songs: BaseItem[], shared: TagChanges, each: Map<string, TagChanges>, coverUrl?: string) {
  const ids = new Set(songs.map((s) => s.Id));
  const patch = (s: BaseItem): BaseItem => {
    const ch = { ...shared, ...each.get(s.Id) };
    const year = ch.date !== undefined ? parseInt(ch.date, 10) : undefined;
    return {
      ...s,
      ...(ch.title !== undefined ? { Name: ch.title } : null),
      ...(ch.artist !== undefined ? { Artists: ch.artist } : null),
      ...(ch.album !== undefined ? { Album: ch.album } : null),
      ...(ch.albumartist !== undefined ? { AlbumArtist: ch.albumartist.join('; ') } : null),
      ...(ch.genre !== undefined ? { Genres: ch.genre } : null),
      ...(year !== undefined ? { ProductionYear: Number.isFinite(year) ? year : undefined } : null),
      ...(ch.tracknumber !== undefined ? { IndexNumber: parseInt(ch.tracknumber, 10) || undefined } : null),
      ...(ch.discnumber !== undefined ? { ParentIndexNumber: parseInt(ch.discnumber, 10) || undefined } : null),
    };
  };
  for (const id of ids) patchItem(id, patch);
  usePlayer.setState((s) => ({ queue: s.queue.map((q) => (ids.has(q.Id) ? patch(q) : q)) }));
  if (coverUrl) for (const s of songs) showLocalPicture(s.Id, coverUrl);
}
