// Edit Artist: an artist's details and pictures. Where each part lives decides how it's saved:
// - The name is in the songs' tags (artist and album artist), so a new name is written into
//   every song's file through MRQ (mrq/client.ts saveTags), the way Edit Metadata does. Jellyfin
//   then makes the artist again under the new name (a new id), so the details and pictures are
//   carried over to it.
// - The biography (overview), genres and sort name are Jellyfin's own: saved on the artist
//   and locked, so a library refresh doesn't put the downloaded ones back.
// - Pictures (photo, backdrops, logo, banner) are Jellyfin's too: picked from a file, or from
//   the ones Jellyfin's image providers have online.
// Everything but the pictures' online list needs a Jellyfin administrator; renaming also
// needs MRQ (mrqReady()).
import type { BaseItem } from '@/api/jellyfin';
import { client } from '~/auth/session';
import { MrqError, saveTags, withPaths, type SaveResult, type TagChanges } from '~/mrq/client';

export type ArtistImageType = 'Primary' | 'Backdrop' | 'Logo' | 'Banner';
export const ARTIST_IMAGE_TYPES: ArtistImageType[] = ['Primary', 'Backdrop', 'Logo', 'Banner'];

export interface ArtistImage {
  type: ArtistImageType;
  /** Backdrops are numbered from 0; the others are always 0. */
  index: number;
  url: string;
}

export interface ArtistDetails {
  item: BaseItem & Record<string, unknown>;
  name: string;
  sortName: string;
  overview: string;
  genres: string[];
  /** Every song the artist is on (as an artist or the album artist). */
  songs: BaseItem[];
  images: ArtistImage[];
}

export interface ArtistChanges {
  name?: string;
  sortName?: string;
  overview?: string;
  genres?: string[];
}

export interface ArtistSaveResult {
  /** Songs whose file got the new name. */
  retagged: number;
  failed: SaveResult['failed'];
  /** The artist's id after a rename, once Jellyfin has made it (undefined if not yet). */
  newArtistId?: string;
  /** After a rename, the details and pictures couldn't be carried over yet (Jellyfin was still reading). */
  carryOverPending?: boolean;
}

function signedIn() {
  const c = client();
  if (!c) throw new MrqError('Not signed in.');
  return c;
}

const asError = (e: unknown, what: string) => {
  const status = (e as { status?: number })?.status;
  if (status === 401 || status === 403) return new MrqError(`Only a Jellyfin administrator can change ${what}.`);
  return e instanceof Error ? e : new MrqError(`Couldn’t change ${what}.`);
};

function imagesOf(item: BaseItem): ArtistImage[] {
  const c = signedIn();
  const out: ArtistImage[] = [];
  for (const type of ARTIST_IMAGE_TYPES) {
    if (type === 'Backdrop') {
      (item.BackdropImageTags ?? []).forEach((tag, index) => out.push({ type, index, url: c.itemImageUrl(item.Id, type, index, tag) }));
    } else {
      const tag = item.ImageTags?.[type];
      if (tag) out.push({ type, index: 0, url: c.itemImageUrl(item.Id, type, 0, tag) });
    }
  }
  return out;
}

/** Every song the artist is on: as one of its artists, or as the album artist. */
async function songsOf(artistId: string): Promise<BaseItem[]> {
  const c = signedIn();
  const [own, albums] = await Promise.all([
    c.items({ IncludeItemTypes: 'Audio', ArtistIds: artistId, Limit: 5000 }),
    c.items({ IncludeItemTypes: 'Audio', AlbumArtistIds: artistId, Limit: 5000 }),
  ]);
  const byId = new Map<string, BaseItem>();
  for (const s of [...own.Items, ...albums.Items]) byId.set(s.Id, s);
  return [...byId.values()];
}

/** The artist as Jellyfin has it now, with its songs and pictures. */
export async function loadArtist(artistId: string): Promise<ArtistDetails> {
  const c = signedIn();
  const [item, songs] = await Promise.all([c.getItem(artistId) as Promise<BaseItem & Record<string, unknown>>, songsOf(artistId)]);
  return {
    item,
    name: item.Name ?? '',
    sortName: typeof item.ForcedSortName === 'string' ? item.ForcedSortName : '',
    overview: item.Overview ?? '',
    genres: item.Genres ?? [],
    songs,
    images: imagesOf(item),
  };
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Save the overview, genres and sort name on an artist (locked, so a refresh keeps them). */
async function saveDetails(item: BaseItem & Record<string, unknown>, changes: ArtistChanges): Promise<void> {
  const next: BaseItem & Record<string, unknown> = { ...item };
  const locked = new Set(Array.isArray(item.LockedFields) ? (item.LockedFields as string[]) : []);
  if (changes.overview !== undefined) {
    next.Overview = changes.overview;
    locked.add('Overview');
  }
  if (changes.genres !== undefined) {
    next.Genres = changes.genres;
    next.GenreItems = undefined;
    locked.add('Genres');
  }
  if (changes.sortName !== undefined) next.ForcedSortName = changes.sortName;
  next.LockedFields = [...locked];
  try {
    await signedIn().updateItem(next);
  } catch (e) {
    throw asError(e, 'artist details');
  }
}

/** The songs' tags with the artist's old name swapped for the new one. */
function renamedTags(songs: BaseItem[], from: string, to: string): Map<string, TagChanges> {
  const swap = (names: string[]) => names.map((n) => (n === from ? to : n));
  const each = new Map<string, TagChanges>();
  for (const s of songs) {
    const artists = s.Artists ?? [];
    const albumArtists = (s.AlbumArtists ?? []).map((a) => a.Name);
    const change: TagChanges = {};
    if (artists.includes(from)) change.artist = swap(artists);
    if (albumArtists.includes(from)) change.albumartist = swap(albumArtists);
    if (change.artist || change.albumartist) each.set(s.Id, change);
  }
  return each;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The artist under its new name, once Jellyfin has read the retagged files (up to ~15 s). */
async function findRenamed(name: string): Promise<(BaseItem & Record<string, unknown>) | null> {
  const c = signedIn();
  for (let i = 0; i < 10; i++) {
    await sleep(1500);
    try {
      const a = await c.getArtistByName(name);
      if (a?.Id) return (await c.getItem(a.Id)) as BaseItem & Record<string, unknown>;
    } catch {
      // Not there yet.
    }
  }
  return null;
}

/** Copy the old artist's pictures to the renamed one (it starts with none of its own). */
async function carryImages(from: BaseItem, to: BaseItem): Promise<void> {
  const c = signedIn();
  for (const img of imagesOf(from)) {
    if (img.type !== 'Backdrop' && to.ImageTags?.[img.type]) continue;
    try {
      const res = await fetch(img.url);
      if (!res.ok) continue;
      const blob = await res.blob();
      await c.uploadItemImage(to.Id, await toBase64(blob), blob.type || 'image/jpeg', img.type);
    } catch {
      // Best effort: the picture can be set again by hand.
    }
  }
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Save what changed. A new name goes into every song's file through MRQ, then the details and
 * pictures move to the renamed artist; the rest is saved on the artist in Jellyfin.
 */
export async function saveArtist(artist: ArtistDetails, changes: ArtistChanges): Promise<ArtistSaveResult> {
  const name = changes.name?.trim();
  const details: ArtistChanges = {};
  if (changes.overview !== undefined && changes.overview !== artist.overview) details.overview = changes.overview;
  if (changes.genres !== undefined && !sameList(changes.genres, artist.genres)) details.genres = changes.genres;
  if (changes.sortName !== undefined && changes.sortName !== artist.sortName) details.sortName = changes.sortName;
  const hasDetails = Object.keys(details).length > 0;

  if (!name || name === artist.name) {
    if (hasDetails) await saveDetails(artist.item, details);
    return { retagged: 0, failed: [] };
  }

  const songs = await withPaths(artist.songs);
  const each = renamedTags(songs, artist.name, name);
  const saved = await saveTags(songs, {}, undefined, each);
  if (!saved.changed.length) return { retagged: 0, failed: saved.failed };

  // Jellyfin makes the artist again from the new tags: give it what the old one had.
  const renamed = await findRenamed(name);
  if (!renamed) return { retagged: saved.changed.length, failed: saved.failed, carryOverPending: true };
  const carried: ArtistChanges = {
    overview: details.overview ?? (artist.overview || undefined),
    genres: details.genres ?? (artist.genres.length ? artist.genres : undefined),
    sortName: details.sortName ?? (artist.sortName || undefined),
  };
  for (const k of Object.keys(carried) as (keyof ArtistChanges)[]) if (carried[k] === undefined) delete carried[k];
  await Promise.allSettled([Object.keys(carried).length ? saveDetails(renamed, carried) : Promise.resolve(), carryImages(artist.item, renamed)]);
  return { retagged: saved.changed.length, failed: saved.failed, newArtistId: renamed.Id };
}

// ---- Pictures ----

/** Set the artist's picture of that kind from a file (a backdrop is added after the others). */
export async function setArtistImage(artistId: string, type: ArtistImageType, file: File): Promise<void> {
  try {
    await signedIn().uploadItemImage(artistId, await toBase64(file), file.type || 'image/jpeg', type);
  } catch (e) {
    throw asError(e, 'artist pictures');
  }
}

export async function removeArtistImage(artistId: string, type: ArtistImageType, index = 0): Promise<void> {
  try {
    await signedIn().deleteItemImage(artistId, type, index);
  } catch (e) {
    throw asError(e, 'artist pictures');
  }
}

export interface OnlineImage {
  url: string;
  /** A smaller copy for the picker, when the provider has one. */
  thumb: string;
  provider: string;
  width?: number;
  height?: number;
}

/** Pictures of that kind Jellyfin's providers (TheAudioDB, Fanart.tv...) have for the artist. */
export async function onlineArtistImages(artistId: string, type: ArtistImageType): Promise<OnlineImage[]> {
  const r = await signedIn().getRemoteImages(artistId, type);
  return (r?.Images ?? []).map((i) => ({ url: i.Url, thumb: i.ThumbnailUrl || i.Url, provider: i.ProviderName ?? '', width: i.Width, height: i.Height }));
}

/** Have Jellyfin download one of those for the artist. Load the artist again for the new picture. */
export async function applyOnlineArtistImage(artistId: string, type: ArtistImageType, url: string): Promise<void> {
  try {
    await signedIn().downloadRemoteImage(artistId, type, url);
  } catch (e) {
    throw asError(e, 'artist pictures');
  }
}
