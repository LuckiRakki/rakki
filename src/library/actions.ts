// Things you can do to any item (song, album, playlist, artist) from menus and pages.
import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { emitLikedChanged } from '@/lib/events';
import { downloadedTracks } from '@/downloads/offline';
import { seededShuffle } from '@/library/view';
import { isOffline } from '@/lib/online';
import { MAX_IMAGE_BYTES, pickImage } from '@/lib/pickImage';
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

/**
 * Shuffle the whole library: a queue of random songs (Home's Shuffle button). Offline, the
 * songs on the phone in random order.
 */
export async function playRandom() {
  let songs: BaseItem[];
  if (isOffline()) {
    songs = seededShuffle(downloadedTracks(), Date.now() % 100000);
  } else {
    try {
      songs = await client().getRandomTracks(200);
    } catch {
      showToast('Couldn’t reach your server');
      return;
    }
  }
  if (!songs.length) {
    showToast(isOffline() ? 'Nothing downloaded to shuffle' : 'No songs found');
    return;
  }
  usePlayer.getState().playQueue(songs, { source: { type: 'tracks', name: 'Shuffled library' } });
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
  else {
    await client().setFavorite(item.Id, liked);
    emitLikedChanged();
  }
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

const playlistItemsKey = (playlistId: string) => ['playlistItems', client().session.userId, playlistId];

/** Move a song within a playlist. The list updates at once; the server catches up. */
export async function movePlaylistEntry(playlistId: string, from: number, to: number) {
  const key = playlistItemsKey(playlistId);
  const items = queryClient.getQueryData<BaseItem[]>(key);
  const entryId = items?.[from]?.PlaylistItemId;
  if (!items || !entryId || from === to) return;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  queryClient.setQueryData(key, next);
  try {
    await client().movePlaylistItem(playlistId, entryId, to);
  } catch {
    showToast('Couldn’t move that song. Try again.');
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/** Remove a song in the playlist editor: gone from the list at once, then from the server. */
export async function removePlaylistEntry(playlistId: string, entryId: string) {
  const key = playlistItemsKey(playlistId);
  const items = queryClient.getQueryData<BaseItem[]>(key);
  if (items) queryClient.setQueryData(key, items.filter((x) => x.PlaylistItemId !== entryId));
  try {
    await client().removeFromPlaylist(playlistId, [entryId]);
  } catch {
    showToast('Couldn’t remove that song. Try again.');
  }
  refreshPlaylists();
}

/** Rename without a dialog (the playlist editor's name field). */
export async function savePlaylistName(playlistId: string, name: string) {
  await client().renamePlaylist(playlistId, name);
  refreshPlaylists();
}

/** Pick a picture and make it the playlist's cover. */
export async function changePlaylistPicture(playlistId: string) {
  if (Platform.OS === 'web') {
    showToast('Change the picture in the iPhone app');
    return;
  }
  const picked = await pickImage();
  if (!picked) return;
  if (picked.size > MAX_IMAGE_BYTES) {
    Alert.alert('That picture is too big', 'Pick one under 15 MB.');
    return;
  }
  showToast('Uploading the picture…');
  try {
    await client().uploadItemImage(playlistId, await picked.base64(), picked.mime);
    // The new image has a new tag, so its address changes and every view loads it.
    refreshPlaylists();
    showToast('Playlist picture updated');
  } catch (e) {
    Alert.alert('Couldn’t change the picture', e instanceof Error ? e.message : 'Try again.');
  }
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
