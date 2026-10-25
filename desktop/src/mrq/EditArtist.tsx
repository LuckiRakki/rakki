// Edit Artist (right-click an artist, or More on their page), beside Edit Album: the artist's
// name, sort name, genres, biography and pictures. A new name is written into every song's
// artist and album artist tags by MRQ, so renaming needs MRQ's address; the rest is Jellyfin's
// own and kept there (mrq/artist.ts). Pictures: their photo (Picture) and the wide one behind
// their name on their page (Header), then under More Options the Logo and Banner other Jellyfin
// apps show. Each can be a file, one found online, or removed. Nothing is written until Save;
// Save closes the dialog at once, the changes show straight away and a toast says how it went.
import { useEffect, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { patchItem } from '~/library/actions';
import { applyOnlineArtistImage, loadArtist, onlineArtistImages, removeArtistImage, replaceArtistBackdrop, saveArtist, setArtistImage, type ArtistChanges, type ArtistDetails, type ArtistImageType, type OnlineImage } from '~/mrq/artist';
import { mrqReady } from '~/mrq/client';
import { go, useNav } from '~/nav';
import { usePlayer } from '~/player/store';
import { queryClient } from '~/queries';
import { ChevronDown, ChevronLeft, ImagePlus, Refresh, Search, Trash2, Undo } from '~/ui/icons';
import { closeDialog, showDialog, toast } from '~/ui/overlays';
import { Artwork, showLocalPicture } from '~/ui/parts';
import { Empty, Loading } from '~/ui/states';

interface Slot {
  type: ArtistImageType;
  label: string;
  detail: string;
  /** How the preview is cut: a round photo, a wide header, a logo on nothing, a long strip. */
  shape: 'round' | 'wide' | 'logo' | 'banner';
}

const SLOTS: Slot[] = [
  { type: 'Primary', label: 'Picture', detail: 'Their photo, on cards and on their page.', shape: 'round' },
  { type: 'Backdrop', label: 'Header', detail: 'The wide picture behind their name on their page.', shape: 'wide' },
  { type: 'Logo', label: 'Logo', detail: 'Their name as artwork, shown by other Jellyfin apps.', shape: 'logo' },
  { type: 'Banner', label: 'Banner', detail: 'A long strip, shown by other Jellyfin apps.', shape: 'banner' },
];
const MAIN_SLOTS = SLOTS.slice(0, 2);
const MORE_SLOTS = SLOTS.slice(2);

/** A picture waiting for Save: a file from this computer, one found online, or none. */
type Staged = { kind: 'file'; file: File; url: string } | { kind: 'online'; url: string; thumb: string } | { kind: 'remove' };

/** Genres typed with ; (or commas) between them. */
const toList = (v: string) =>
  v
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function openEditArtist(artist: BaseItem) {
  showDialog(<ArtistEditor artist={artist} />);
}

/** Pick a picture file (the same limits as an album cover). */
function chooseFile(then: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return toast('That picture is too big: pick one under 15 MB');
    then(file);
  };
  input.click();
}

function ArtistEditor({ artist }: { artist: BaseItem }) {
  const [details, setDetails] = useState<ArtistDetails | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState<{ name?: string; sortName?: string; genres?: string; overview?: string }>({});
  const [staged, setStaged] = useState<Partial<Record<ArtistImageType, Staged>>>({});
  const [finding, setFinding] = useState<Slot | null>(null);
  const [more, setMore] = useState(false);
  const canRename = mrqReady();

  useEffect(() => {
    let alive = true;
    loadArtist(artist.Id)
      .then((d) => alive && setDetails(d))
      .catch((e: unknown) => alive && setProblem(e instanceof Error ? e.message : 'Jellyfin didn’t answer.'));
    return () => {
      alive = false;
    };
  }, [artist.Id]);

  // What's there now: Jellyfin's details once loaded, the artist as listed until then.
  const start = {
    name: details?.name ?? artist.Name ?? '',
    sortName: details?.sortName ?? '',
    genres: (details?.genres ?? artist.Genres ?? []).join('; '),
    overview: details?.overview ?? artist.Overview ?? '',
  };
  const value = (k: keyof typeof start) => typed[k] ?? start[k];
  const changes: ArtistChanges = {};
  const name = value('name').trim();
  if (name && name !== start.name.trim()) changes.name = name;
  if (value('sortName').trim() !== start.sortName.trim()) changes.sortName = value('sortName').trim();
  if (value('overview').trim() !== start.overview.trim()) changes.overview = value('overview').trim();
  if (toList(value('genres')).join(';') !== toList(start.genres).join(';')) changes.genres = toList(value('genres'));
  // Saving needs the artist as Jellyfin has it (its songs, for a new name).
  const dirty = !!details && (Object.keys(changes).length > 0 || Object.keys(staged).length > 0);
  const songs = details?.songs.length;

  const stage = (type: ArtistImageType, s: Staged | null) =>
    setStaged((m) => {
      const next = { ...m };
      if (s) next[type] = s;
      else delete next[type];
      return next;
    });
  const pickFile = (slot: Slot) => chooseFile((file) => stage(slot.type, { kind: 'file', file, url: URL.createObjectURL(file) }));

  if (finding) {
    return (
      <OnlinePicker
        artistId={artist.Id}
        artistName={start.name}
        slot={finding}
        onBack={() => setFinding(null)}
        onPick={(img) => {
          stage(finding.type, { kind: 'online', url: img.url, thumb: img.thumb });
          setFinding(null);
        }}
        onFile={() => {
          const slot = finding;
          setFinding(null);
          pickFile(slot);
        }}
      />
    );
  }

  const tiles = (slots: Slot[]) => (
    <div className="art-slots">
      {slots.map((slot) => (
        <PictureSlot key={slot.type} slot={slot} artist={artist} details={details} staged={staged[slot.type]} onFile={() => pickFile(slot)} onFind={() => setFinding(slot)} onRemove={() => stage(slot.type, { kind: 'remove' })} onUndo={() => stage(slot.type, null)} />
      ))}
    </div>
  );

  return (
    <form
      className="meta-edit meta-artist"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && details) saveAndReport(artist, details, changes, staged);
      }}>
      <div className="meta-head">
        <button type="button" className="meta-cover round" onClick={() => pickFile(SLOTS[0])} title="Change Picture" aria-label="Change Picture">
          {staged.Primary && staged.Primary.kind !== 'remove' ? (
            <div className="artwork round">
              <img src={staged.Primary.kind === 'online' ? staged.Primary.thumb : staged.Primary.url} alt="" />
            </div>
          ) : (
            <Artwork item={artist} size={200} round />
          )}
          <span className="meta-cover-hint">
            <ImagePlus size={20} />
          </span>
        </button>
        <div style={{ minWidth: 0 }}>
          <h2 className="dialog-title">Edit Artist</h2>
          <p className="muted ellipsis">{songs === undefined ? start.name : `${start.name} · ${songs === 1 ? '1 song' : `${songs} songs`}`}</p>
          <p className="muted small">Kept by Jellyfin. A new name is written to the files by MRQ.</p>
        </div>
      </div>
      {problem ? <p className="setting-detail error">{problem}</p> : null}
      <div className="meta-body">
      <div className="meta-grid">
        <label className="meta-field">
          <span className="field-label">Name</span>
          <input className="field" value={value('name')} disabled={!canRename} spellCheck={false} autoFocus={canRename} onChange={(e) => setTyped((t) => ({ ...t, name: e.target.value }))} />
          {!canRename ? (
            <span className="setting-detail">Renaming writes the new name into the files: add your MRQ address in Settings → Connections first.</span>
          ) : changes.name && songs !== undefined ? (
            <span className="setting-detail">Renames them in {songs === 1 ? '1 song’s file' : `${songs} songs’ files`}, as artist and album artist.</span>
          ) : null}
        </label>
        <label className="meta-field">
          <span className="field-label">Sort Name</span>
          <input className="field" value={value('sortName')} placeholder="Like the name" spellCheck={false} onChange={(e) => setTyped((t) => ({ ...t, sortName: e.target.value }))} />
        </label>
        <label className="meta-field wide">
          <span className="field-label">Genres</span>
          <input className="field" value={value('genres')} placeholder="Separate with ;" spellCheck={false} autoFocus={!canRename} onChange={(e) => setTyped((t) => ({ ...t, genres: e.target.value }))} />
        </label>
        <label className="meta-field wide">
          <span className="field-label">Biography</span>
          <textarea className="field area" value={value('overview')} rows={5} placeholder="Who they are, shown under About on their page" onChange={(e) => setTyped((t) => ({ ...t, overview: e.target.value }))} />
        </label>
      </div>
      <div className="meta-field wide">
        <span className="field-label">Pictures</span>
        {tiles(MAIN_SLOTS)}
      </div>
      <div className={`more${more ? ' open' : ''}`}>
        <button type="button" className="more-head" aria-expanded={more} onClick={() => setMore(!more)}>
          More Options
          <ChevronDown size={16} />
        </button>
        {more ? <div className="more-body">{tiles(MORE_SLOTS)}</div> : null}
      </div>
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

/** One picture: what it is now (or what Save will put there), and how to change it. */
function PictureSlot({ slot, artist, details, staged, onFile, onFind, onRemove, onUndo }: { slot: Slot; artist: BaseItem; details: ArtistDetails | null; staged?: Staged; onFile(): void; onFind(): void; onRemove(): void; onUndo(): void }) {
  // Backdrops are numbered: the first is the one the artist page draws.
  const now = details?.images.find((i) => i.type === slot.type && i.index === 0);
  const src = staged ? (staged.kind === 'remove' ? null : staged.kind === 'online' ? staged.thumb : staged.url) : (now?.url ?? null);
  const note = staged?.kind === 'remove' ? 'Removed on Save' : staged ? 'New, kept on Save' : null;
  return (
    <div className={`art-slot art-${slot.shape}`}>
      <button type="button" className="art-preview" onClick={onFile} aria-label={`Change ${slot.label}, ${artist.Name ?? ''}`} title={`Change ${slot.label}`}>
        {src ? <img src={src} alt="" draggable={false} /> : <ImagePlus size={22} />}
      </button>
      <div className="art-slot-text">
        <span className="art-slot-name">{slot.label}</span>
        <span className="muted small">{note ?? `${details && !now ? 'None yet. ' : ''}${slot.detail}`}</span>
      </div>
      <div className="art-slot-actions">
        <button type="button" className="secondary small" onClick={onFile}>
          Choose File
        </button>
        <button type="button" className="secondary small" onClick={onFind}>
          <Search size={14} />
          Find Online
        </button>
        {staged ? (
          <button type="button" className="iconbtn" onClick={onUndo} aria-label={`Keep the ${slot.label} as It Was`} title="Keep as It Was">
            <Undo size={16} />
          </button>
        ) : now ? (
          <button type="button" className="iconbtn" onClick={onRemove} aria-label={`Remove ${slot.label}`} title={`Remove ${slot.label}`}>
            <Trash2 size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Pictures of the artist from Jellyfin's image sources (TheAudioDB, fanart.tv...): pick one. */
function OnlinePicker({ artistId, artistName, slot, onBack, onPick, onFile }: { artistId: string; artistName: string; slot: Slot; onBack(): void; onPick(img: OnlineImage): void; onFile(): void }) {
  const [images, setImages] = useState<OnlineImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setImages(null);
    setError(null);
    onlineArtistImages(artistId, slot.type)
      .then((list) => alive && setImages(list))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Jellyfin didn’t answer.'));
    return () => {
      alive = false;
    };
  }, [artistId, slot.type, attempt]);

  return (
    <div className="meta-edit art-online">
      <div className="art-online-head">
        <button type="button" className="iconbtn" onClick={onBack} aria-label="Back" title="Back">
          <ChevronLeft size={20} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h2 className="dialog-title">Find Online</h2>
          <p className="muted ellipsis">
            {slot.label} for {artistName}, from your server’s image sources
          </p>
        </div>
      </div>
      {error ? (
        <div className="art-online-state">
          <p className="setting-detail error">Couldn’t look online: {error}</p>
          <button type="button" className="secondary small" onClick={() => setAttempt((n) => n + 1)}>
            <Refresh size={14} />
            Try Again
          </button>
        </div>
      ) : images === null ? (
        <Loading what={`pictures of ${artistName}`} />
      ) : images.length === 0 ? (
        <Empty icon={ImagePlus} title={`No ${slot.label} Found`} detail={`Your server’s image sources have none for ${artistName}.`} action={{ label: 'Choose File', run: onFile }} />
      ) : (
        <div className={`art-online-grid art-${slot.shape}`}>
          {images.map((img) => (
            <button key={img.url} type="button" className="art-online-pick" onClick={() => onPick(img)} title={`Use This ${slot.label}`}>
              <span className="art-online-img">
                <img src={img.thumb} alt="" loading="lazy" decoding="async" draggable={false} />
              </span>
              <span className="muted small ellipsis">
                {img.provider}
                {img.width && img.height ? ` · ${img.width} × ${img.height}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

/** A name changed on every song row in view (Jellyfin catches up after reading the files). */
function renameInSongs(songs: BaseItem[], from: string, to: string) {
  const swap = (v?: string) => (v === from ? to : v);
  const patch = (s: BaseItem): BaseItem => ({
    ...s,
    Artists: s.Artists?.map((a) => swap(a) ?? a),
    AlbumArtist: swap(s.AlbumArtist),
    ArtistItems: s.ArtistItems?.map((a) => ({ ...a, Name: swap(a.Name) ?? a.Name })),
    AlbumArtists: s.AlbumArtists?.map((a) => ({ ...a, Name: swap(a.Name) ?? a.Name })),
  });
  const ids = new Set(songs.map((s) => s.Id));
  for (const id of ids) patchItem(id, patch);
  usePlayer.setState((p) => ({ queue: p.queue.map((q) => (ids.has(q.Id) ? patch(q) : q)) }));
}

/** Close, show the change at once, save behind the screen, say how it went (undo on failure). */
function saveAndReport(artist: BaseItem, details: ArtistDetails, changes: ArtistChanges, staged: Partial<Record<ArtistImageType, Staged>>) {
  closeDialog();
  const was = details.name || (artist.Name ?? '');
  patchItem(artist.Id, (a) => ({
    ...a,
    ...(changes.name !== undefined ? { Name: changes.name } : null),
    ...(changes.overview !== undefined ? { Overview: changes.overview } : null),
    ...(changes.genres !== undefined ? { Genres: changes.genres } : null),
  }));
  if (changes.name) renameInSongs(details.songs, was, changes.name);
  const photo = staged.Primary;
  if (photo && photo.kind !== 'remove') showLocalPicture(artist.Id, photo.kind === 'online' ? photo.thumb : photo.url);
  const name = changes.name ?? was;

  void (async () => {
    let id = artist.Id;
    let renamed = '';
    if (Object.keys(changes).length) {
      const r = await saveArtist(details, changes);
      if (changes.name && !r.retagged) {
        const why = r.failed[0]?.why ?? 'MRQ didn’t change any files';
        throw new Error(why);
      }
      if (changes.name) {
        renamed = r.failed.length ? `, renamed in ${r.retagged} of ${r.retagged + r.failed.length} songs (${r.failed[0].song.Name}: ${r.failed[0].why})` : `, renamed in ${r.retagged === 1 ? '1 song' : `${r.retagged} songs`}`;
        if (r.carryOverPending || !r.newArtistId) {
          // The files have the new name, but Jellyfin hasn't made the renamed artist yet.
          setTimeout(() => void queryClient.invalidateQueries(), 4000);
          toast(`Renamed ${was} to ${name} in ${r.retagged === 1 ? '1 song' : `${r.retagged} songs`}. Jellyfin is still reading them: open Edit Artist on ${name} in a minute to add the biography and pictures again.`);
          return;
        }
        id = r.newArtistId;
        // A new name is a new artist to Jellyfin: their page follows them there.
        const route = useNav.getState().route;
        if (route.name === 'artist' && route.id === artist.Id) go({ name: 'artist', id });
      }
    }
    // Pictures after the name, so they land on the artist as Jellyfin now has them.
    const failedPics: string[] = [];
    for (const slot of SLOTS) {
      const s = staged[slot.type];
      if (!s) continue;
      try {
        // The Header is the first backdrop: a new one takes its place, any others stay.
        if (s.kind !== 'remove' && slot.type === 'Backdrop') await replaceArtistBackdrop(id, s.kind === 'file' ? s.file : s.url, 0);
        else if (s.kind === 'file') await setArtistImage(id, slot.type, s.file);
        else if (s.kind === 'online') await applyOnlineArtistImage(id, slot.type, s.url);
        else if (details.images.some((i) => i.type === slot.type && i.index === 0)) await removeArtistImage(id, slot.type, 0);
      } catch {
        failedPics.push(slot.label);
      }
    }
    setTimeout(() => void queryClient.invalidateQueries(), changes.name ? 4000 : 0);
    if (failedPics.length) toast(`Saved ${name}${renamed}, but couldn’t change the ${failedPics.join(' and ')}`);
    else toast(`Saved ${name}${renamed}`);
  })().catch((e: unknown) => {
    if (photo) showLocalPicture(artist.Id, null);
    void queryClient.invalidateQueries();
    toast(`Couldn’t save ${was}: ${e instanceof Error ? e.message : 'the server said no'}`);
  });
}
