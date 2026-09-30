// Things you can do to any item (song, album, playlist, artist) from menus and pages.
import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { usePlayer } from '@/player/store';
import { showToast } from '@/ui/overlays';

function client() {
  const c = useAuth.getState().client;
  if (!c) throw new Error('Not signed in');
  return c;
}

/** The songs an item stands for: itself, an album's or playlist's tracks, an artist's radio. */
export async function tracksOf(item: BaseItem): Promise<BaseItem[]> {
  switch (item.Type) {
    case 'Audio':
      return [item];
    case 'MusicAlbum':
      return (await client().getAlbumTracks(item.Id)).Items;
    case 'Playlist':
      return (await client().getPlaylistItems(item.Id)).Items;
    case 'MusicArtist':
      return client().getInstantMix(item.Id, 100);
    default:
      return [];
  }
}

export async function playNext(item: BaseItem) {
  const tracks = await tracksOf(item);
  usePlayer.getState().playNext(tracks);
  showToast(tracks.length > 1 ? `${tracks.length} songs will play next` : `“${item.Name}” will play next`);
}

export async function addToQueue(item: BaseItem) {
  const tracks = await tracksOf(item);
  usePlayer.getState().addToQueue(tracks);
  showToast(tracks.length > 1 ? `Added ${tracks.length} songs to the queue` : `Added to queue`);
}

/** Jellyfin's instant mix from any item: songs like it, starting now. */
export async function startRadio(item: BaseItem) {
  const tracks = await client().getInstantMix(item.Id, 100);
  if (!tracks.length) {
    showToast('No radio for this one yet');
    return;
  }
  usePlayer.getState().playQueue(tracks, { source: { type: 'tracks', name: `${item.Name} Radio` } });
}

/** Like / unlike. Songs in the queue update immediately; lists refresh in the background. */
export async function setLiked(item: BaseItem, liked: boolean) {
  const inQueue = usePlayer.getState().queue.some((e) => e.item.Id === item.Id);
  if (inQueue) usePlayer.getState().setFavorite(item.Id, liked);
  else await client().setFavorite(item.Id, liked);
  const what = item.Type === 'Audio' ? 'Liked Songs' : 'your Liked';
  showToast(liked ? `Added to ${what}` : `Removed from ${what}`);
  void queryClient.invalidateQueries({
    predicate: (q) =>
      ['likedSongs', 'item', 'albumTracks', 'topTracks', 'playlistItems', 'artistAlbums'].includes(q.queryKey[0] as string),
  });
}

export function isLiked(item: BaseItem): boolean {
  return item.UserData?.IsFavorite ?? false;
}

function refreshPlaylists() {
  void queryClient.invalidateQueries({
    predicate: (q) => ['playlists', 'playlistItems', 'item'].includes(q.queryKey[0] as string),
  });
}

export async function removeFromPlaylist(playlistId: string, entryId: string, name: string) {
  await client().removeFromPlaylist(playlistId, [entryId]);
  refreshPlaylists();
  showToast(`Removed “${name}”`);
}

/** Ask for a name (iOS prompt; plain prompt on web). */
export function askName(title: string, message: string, initial = ''): Promise<string | null> {
  if (Platform.OS === 'ios') {
    return new Promise((resolve) =>
      Alert.prompt(
        title,
        message,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          { text: 'Save', onPress: (v?: string) => resolve(v?.trim() || null) },
        ],
        'plain-text',
        initial,
      ),
    );
  }
  return Promise.resolve(globalThis.prompt?.(message, initial)?.trim() || null);
}

export async function renamePlaylist(playlist: BaseItem) {
  const name = await askName('Rename playlist', 'Give your playlist a new name.', playlist.Name);
  if (!name || name === playlist.Name) return;
  await client().renamePlaylist(playlist.Id, name);
  refreshPlaylists();
  showToast(`Renamed to “${name}”`);
}

export function deletePlaylist(playlist: BaseItem) {
  const doDelete = async () => {
    await client().deletePlaylist(playlist.Id);
    refreshPlaylists();
    showToast(`Deleted “${playlist.Name}”`);
  };
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`Delete “${playlist.Name}”?`)) void doDelete();
    return;
  }
  Alert.alert('Delete playlist?', `“${playlist.Name}” will be deleted from your server.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
  ]);
}

/** Create an (optionally pre-filled) playlist and open it. */
export async function createPlaylist(items: BaseItem[] = []) {
  const name = await askName('New playlist', 'Give your playlist a name.');
  if (!name) return;
  const id = await client().createPlaylist(name, items.map((i) => i.Id));
  refreshPlaylists();
  router.push(`/playlist/${id}`);
}
