// What the app shows offline, built from what's downloaded: albums, playlists, Liked Songs,
// artists, and the songs that are actually on the phone. Albums or artists you didn't
// download as a whole still appear with the songs you have (from a playlist, say).
import type { BaseItem, GenreCount } from '@/api/jellyfin';
import { useDownloads, type DownloadedCollection } from '@/downloads/store';

function state() {
  return useDownloads.getState();
}

/** Songs that are on the phone. */
export function downloadedTracks(): BaseItem[] {
  return Object.values(state().tracks)
    .filter((t) => t.state === 'done')
    .map((t) => t.item);
}

function done(ids: string[]): BaseItem[] {
  const { tracks } = state();
  return ids.map((id) => tracks[id]).filter((t) => t?.state === 'done').map((t) => t!.item);
}

function byNewest(a: DownloadedCollection, b: DownloadedCollection) {
  return b.addedAt - a.addedAt;
}

/** Albums you downloaded, newest first. */
export function downloadedAlbums(): BaseItem[] {
  return Object.values(state().collections)
    .filter((c) => c.kind === 'album')
    .sort(byNewest)
    .map((c) => c.item);
}

/** Playlists you downloaded (Liked Songs has its own row). */
export function downloadedPlaylists(): BaseItem[] {
  return Object.values(state().collections)
    .filter((c) => c.kind === 'playlist')
    .sort(byNewest)
    .map((c) => ({ ...c.item, ChildCount: done(c.trackIds).length }));
}

/** Album songs on the phone, in album order. */
export function offlineAlbumTracks(albumId: string): BaseItem[] {
  return downloadedTracks()
    .filter((t) => t.AlbumId === albumId)
    .sort((a, b) => (a.ParentIndexNumber ?? 1) - (b.ParentIndexNumber ?? 1) || (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0));
}

/** A playlist's songs on the phone, in playlist order. */
export function offlinePlaylistTracks(playlistId: string): BaseItem[] {
  const c = state().collections[playlistId];
  return c ? done(c.trackIds) : [];
}

/** Liked Songs on the phone: the downloaded Liked Songs, or any downloaded song you've liked. */
export function offlineLikedTracks(): BaseItem[] {
  const liked = state().collections.liked;
  return liked ? done(liked.trackIds) : downloadedTracks().filter((t) => t.UserData?.IsFavorite);
}

/** Artists of the songs on the phone, by name. */
export function downloadedArtists(): BaseItem[] {
  const artists = new Map<string, BaseItem>();
  for (const t of downloadedTracks()) {
    for (const a of t.AlbumArtists ?? []) {
      if (a.Id && !artists.has(a.Id)) artists.set(a.Id, { Id: a.Id, Name: a.Name, Type: 'MusicArtist' });
    }
  }
  return [...artists.values()].sort((a, b) => a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' }));
}

/** Albums by an artist that have songs on the phone. */
export function offlineArtistAlbums(artistId: string): BaseItem[] {
  const albums = new Map<string, BaseItem>();
  for (const t of downloadedTracks()) {
    if (t.AlbumId && t.AlbumArtists?.some((a) => a.Id === artistId) && !albums.has(t.AlbumId)) {
      albums.set(t.AlbumId, albumFromTrack(t));
    }
  }
  return [...albums.values()];
}

/** An artist's songs on the phone, the ones you play most first. */
export function offlineArtistTracks(artistId: string): BaseItem[] {
  return downloadedTracks()
    .filter((t) => t.ArtistItems?.some((a) => a.Id === artistId) || t.AlbumArtists?.some((a) => a.Id === artistId))
    .sort((a, b) => (b.UserData?.PlayCount ?? 0) - (a.UserData?.PlayCount ?? 0));
}

/** Albums in a genre that you downloaded. */
export function offlineGenreAlbums(genre: string): BaseItem[] {
  return downloadedAlbums().filter((a) => a.Genres?.includes(genre));
}

/** Genres of the downloaded albums, most albums first (Library → Genres offline). */
export function offlineGenreCounts(): GenreCount[] {
  const byGenre = new Map<string, BaseItem[]>();
  for (const album of downloadedAlbums()) {
    for (const g of album.Genres ?? []) byGenre.set(g, [...(byGenre.get(g) ?? []), album]);
  }
  return [...byGenre]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, albums]) => ({ name, count: albums.length, album: albums.find((x) => x.ImageTags?.Primary) ?? albums[0] }));
}

function albumFromTrack(t: BaseItem): BaseItem {
  const collection = t.AlbumId ? state().collections[t.AlbumId] : undefined;
  if (collection) return collection.item;
  return {
    Id: t.AlbumId!,
    Name: t.Album ?? 'Unknown album',
    Type: 'MusicAlbum',
    AlbumArtist: t.AlbumArtist,
    AlbumArtists: t.AlbumArtists,
    ProductionYear: t.ProductionYear,
    ImageTags: t.AlbumPrimaryImageTag ? { Primary: t.AlbumPrimaryImageTag } : undefined,
    ImageBlurHashes: t.ImageBlurHashes,
  };
}

/**
 * Any item offline: a downloaded album/playlist/song, an album or artist you have songs from,
 * or null when there's nothing of it on the phone.
 */
export function offlineItem(id: string): BaseItem | null {
  const { collections, tracks } = state();
  if (collections[id]) return collections[id].item;
  if (tracks[id]?.state === 'done') return tracks[id].item;
  for (const t of downloadedTracks()) {
    if (t.AlbumId === id) return albumFromTrack(t);
    const artist = [...(t.AlbumArtists ?? []), ...(t.ArtistItems ?? [])].find((a) => a.Id === id);
    if (artist) return { Id: artist.Id, Name: artist.Name, Type: 'MusicArtist' };
  }
  return null;
}
