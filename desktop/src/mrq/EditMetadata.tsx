// Edit Metadata (right-click a song or an album): change the tags in the files themselves,
// through MRQ (mrq/client.ts), like MRQ's own Tag Editor. Several songs at once is a batch
// edit: a field they disagree on shows how many values it has and is left alone unless you
// type in it. Save closes the dialog at once; the new names show straight away and a toast says
// how it went once MRQ has written the files and Jellyfin has been asked to read them again.
import { useEffect, useMemo, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { songsOf, patchItem } from '~/library/actions';
import { MrqError, saveTags, withPaths, type TagChanges } from '~/mrq/client';
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

export function openEditMetadata(items: BaseItem[]) {
  void Promise.all(items.map(songsOf)).then((lists) => {
    const songs = lists.flat().filter((s) => s.Type === 'Audio');
    if (songs.length) showDialog(<EditMetadata songs={songs} />);
  });
}

function EditMetadata({ songs: given }: { songs: BaseItem[] }) {
  // Jellyfin's current values with each file's location (genres too, which lists leave out).
  const [songs, setSongs] = useState(given);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    withPaths(given)
      .then((full) => alive && full.length && setSongs(full))
      .catch((e: unknown) => alive && setProblem(e instanceof Error ? e.message : 'Jellyfin didn’t answer.'));
    return () => {
      alive = false;
    };
  }, [given]);

  const one = songs.length === 1;
  const fields = FIELDS.filter((f) => one || !f.single);
  const start = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, shared(songs, f)])) as Record<Key, ReturnType<typeof shared>>, [songs]); // eslint-disable-line react-hooks/exhaustive-deps
  const [typed, setTyped] = useState<Partial<Record<Key, string>>>({});
  const [cover, setCover] = useState<{ file: File; url: string } | null>(null);

  const valueOf = (k: Key) => typed[k] ?? start[k]?.value ?? '';
  /** A field counts as changed when it differs from what every song has (or, mixed, when typed in). */
  const changes = (): TagChanges => {
    const out: Record<string, string | string[]> = {};
    for (const f of fields) {
      const now = (typed[f.key] ?? '').trim();
      if (typed[f.key] === undefined) continue;
      const was = start[f.key].value;
      if (was === null ? now === '' : now === was.trim()) continue;
      out[f.key] = f.list ? toList(f.key, now) : now;
    }
    return out as TagChanges;
  };
  const dirty = Object.keys(changes()).length > 0 || !!cover;

  const pickCover = () => {
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

  const save = () => {
    const ch = changes();
    closeDialog();
    showChanges(songs, ch, cover?.url);
    void saveTags(songs, ch, cover?.file)
      .then(({ changed, failed }) => {
        // Jellyfin reads the files a moment after being asked; then every list shows what it has.
        setTimeout(() => void queryClient.invalidateQueries(), changed.length ? 4000 : 0);
        if (!failed.length) toast(songs.length === 1 ? 'Metadata saved' : `Metadata saved to ${songs.length} songs`);
        else if (!changed.length) toast(`Couldn’t save: ${failed[0].why}`);
        else toast(`Saved ${changed.length} of ${songs.length} songs. ${failed[0].song.Name}: ${failed[0].why}`);
      })
      .catch((e: unknown) => {
        void queryClient.invalidateQueries();
        toast(`Couldn’t save: ${e instanceof MrqError || e instanceof Error ? e.message : 'MRQ didn’t answer'}`);
      });
  };

  const first = songs[0];
  return (
    <form
      className="meta-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save();
      }}>
      <div className="meta-head">
        <button type="button" className="meta-cover" onClick={pickCover} title="Change Cover" aria-label="Change Cover">
          {cover ? (
            <div className="artwork">
              <img src={cover.url} alt="" />
            </div>
          ) : (
            <Artwork item={first} size={200} />
          )}
          <span className="meta-cover-hint">
            <ImagePlus size={20} />
          </span>
        </button>
        <div style={{ minWidth: 0 }}>
          <h2 className="dialog-title">Edit Metadata</h2>
          <p className="muted ellipsis">{one ? `${first.Name} · ${first.Artists?.join(', ') ?? ''}` : `${songs.length} songs`}</p>
          <p className="muted small">Written to the {one ? 'file' : 'files'} by MRQ.{cover ? ' New cover picked.' : ''}</p>
        </div>
      </div>
      {problem ? <p className="setting-detail error">{problem}</p> : null}
      <div className="meta-grid">
        {fields.map((f) => {
          const s = start[f.key];
          const mixed = s.value === null;
          return (
            <label key={f.key} className={`meta-field${f.narrow ? ' narrow' : ''}`}>
              <span className="field-label">{f.label}</span>
              <input
                className="field"
                value={valueOf(f.key)}
                placeholder={mixed ? `Keep (${s.count} different)` : f.list ? 'Separate with ;' : ''}
                inputMode={f.narrow ? 'numeric' : undefined}
                spellCheck={false}
                autoFocus={f.key === (one ? 'title' : 'artist')}
                onChange={(e) => setTyped((t) => ({ ...t, [f.key]: e.target.value }))}
              />
            </label>
          );
        })}
      </div>
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={closeDialog}>
          Cancel
        </button>
        <button className="primary" disabled={!dirty}>
          Save
        </button>
      </div>
    </form>
  );
}

/** The new names everywhere at once (Jellyfin catches up a moment later). */
function showChanges(songs: BaseItem[], ch: TagChanges, coverUrl?: string) {
  const ids = new Set(songs.map((s) => s.Id));
  const year = ch.date !== undefined ? parseInt(ch.date, 10) : undefined;
  const patch = (s: BaseItem): BaseItem => ({
    ...s,
    ...(ch.title !== undefined ? { Name: ch.title } : null),
    ...(ch.artist !== undefined ? { Artists: ch.artist } : null),
    ...(ch.album !== undefined ? { Album: ch.album } : null),
    ...(ch.albumartist !== undefined ? { AlbumArtist: ch.albumartist.join('; ') } : null),
    ...(ch.genre !== undefined ? { Genres: ch.genre } : null),
    ...(year !== undefined ? { ProductionYear: Number.isFinite(year) ? year : undefined } : null),
    ...(ch.tracknumber !== undefined ? { IndexNumber: parseInt(ch.tracknumber, 10) || undefined } : null),
    ...(ch.discnumber !== undefined ? { ParentIndexNumber: parseInt(ch.discnumber, 10) || undefined } : null),
  });
  for (const id of ids) patchItem(id, patch);
  usePlayer.setState((s) => ({ queue: s.queue.map((q) => (ids.has(q.Id) ? patch(q) : q)) }));
  if (coverUrl) for (const s of songs) showLocalPicture(s.Id, coverUrl);
}
