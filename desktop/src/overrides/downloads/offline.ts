// Downloads aren't on the desktop yet, so offline lists are always empty (the shared search
// and queries ask for them when offline, which the desktop never is).
import type { BaseItem, GenreCount } from '@/api/jellyfin';

const none = (): BaseItem[] => [];

export const downloadedTracks = none;
export const downloadedAlbums = none;
export const downloadedPlaylists = none;
export const downloadedArtists = none;
export const offlineAlbumTracks = (_albumId: string): BaseItem[] => [];
export const offlinePlaylistTracks = (_playlistId: string): BaseItem[] => [];
export const offlineLikedTracks = none;
export const offlineArtistAlbums = (_artistId: string): BaseItem[] => [];
export const offlineArtistTracks = (_artistId: string): BaseItem[] => [];
export const offlineGenreAlbums = (_genre: string): BaseItem[] => [];
export const offlineGenreCounts = (): GenreCount[] => [];
export const offlineItem = (_id: string): BaseItem | null => null;
