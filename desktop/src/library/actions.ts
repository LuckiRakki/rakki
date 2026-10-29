// What you can do with songs, albums, artists and playlists, from any menu or button. Changes
// show at once and save behind the screen; if the server says no, they're undone and a toast
// says so (nothing waits on a "Saving" state).
import type { BaseItem } from '@/api/jellyfin';
import { emitLikedChanged, emitPlaylistsChanged } from '@/lib/events';
import { buildSmartQueue } from '@/player/smartQueue';
import { client } from '~/auth/session';
import { go } from '~/nav';
import { usePlayer } from '~/player/store';
import { queryClient } from '~/queries';
import { askText, confirmAction, toast } from '~/ui/overlays';
import { showLocalPicture } from '~/ui/parts';

/** The songs of anything playable (a song is itself). */
export async function songsOf(item: BaseItem): Promise<BaseItem[]> {
  const c = client();
  if (!c) return [];
  switch (item.Type) {
    case 'Audio':
      return [item];
    case 'MusicAlbum':
      return (await c.getAlbumTracks(item.Id)).Items;
    case 'Playlist':
      return (await c.getPlaylistItems(item.Id)).Items;
    case 'MusicArtist':
      return c.getArtistTracks(item.Id);
    default:
      return [];
  }
}

export async function playItem(item: BaseItem, opts?: { shuffle?: boolean }) {
  const songs = await songsOf(item);
  if (songs.length) usePlayer.getState().playQueue(songs, 0, opts);
}

export async function playNext(items: BaseItem[]) {
  const songs = (await Promise.all(items.map(songsOf))).flat();
  if (!songs.length) return;
  usePlayer.getState().playNext(songs);
  toast(songs.length === 1 ? 'Playing next' : `${songs.length} songs playing next`);
}

export async function addToQueue(items: BaseItem[]) {
  const songs = (await Promise.all(items.map(songsOf))).flat();
  if (!songs.length) return;
  usePlayer.getState().addToQueue(songs);
  toast(songs.length === 1 ? 'Added to queue' : `${songs.length} songs added to queue`);
}

/** Everything that shows an item's heart, after it changed. */
function refreshLiked(ids: string[], liked: boolean) {
  const patch = (item: BaseItem): BaseItem =>
    ids.includes(item.Id) ? { ...item, UserData: { ...item.UserData, IsFavorite: liked } } : item;
  queryClient.setQueriesData<unknown>({}, (data: unknown) => {
    if (Array.isArray(data)) return data.map((x) => (x && typeof x === 'object' && 'Id' in x ? patch(x as BaseItem) : x));
    if (data && typeof data === 'object' && 'Id' in data) return patch(data as BaseItem);
    return data;
  });
  usePlayer.setState((s) => ({ queue: s.queue.map(patch) }));
  void queryClient.invalidateQueries({ queryKey: ['liked'] });
  emitLikedChanged();
}

export async function setLiked(items: BaseItem[], liked: boolean) {
  const c = client();
  if (!c) return;
  const ids = items.map((i) => i.Id);
  refreshLiked(ids, liked);
  toast(liked ? (items.length === 1 ? 'Added to Liked Songs' : `${items.length} songs liked`) : 'Removed from Liked Songs');
  try {
    await Promise.all(items.map((i) => c.setFavorite(i.Id, liked)));
  } catch {
    refreshLiked(ids, !liked);
    toast(liked ? 'Couldn’t add to Liked Songs' : 'Couldn’t remove from Liked Songs');
  }
}

/** Every cached copy of an item, changed (a rename), or the item taken out of every list (a delete). */
export function patchItem(id: string, change: ((item: BaseItem) => BaseItem) | 'remove') {
  queryClient.setQueriesData<unknown>({}, (data: unknown) => {
    if (Array.isArray(data)) {
      return change === 'remove'
        ? data.filter((x) => !(x && typeof x === 'object' && (x as BaseItem).Id === id))
        : data.map((x) => (x && typeof x === 'object' && (x as BaseItem).Id === id ? change(x as BaseItem) : x));
    }
    if (change !== 'remove' && data && typeof data === 'object' && (data as BaseItem).Id === id) return change(data as BaseItem);
    return data;
  });
}

/** Song, album or artist radio: the phone app's smart queue, seeded with this. */
export async function startRadio(item: BaseItem) {
  const c = client();
  if (!c) return;
  toast('Starting radio...');
  try {
    const seed = item.Type === 'Audio' ? item : (await songsOf(item))[0];
    if (!seed) return;
    const result = await buildSmartQueue(c, [seed], { exclude: new Set([seed.Id]), count: 60, artistRadio: item.Type === 'MusicArtist' });
    const queue = result.items.length ? [seed, ...result.items] : await c.getInstantMix(seed.Id, 100);
    usePlayer.getState().playQueue(queue, 0, { shuffle: false });
  } catch {
    const mix = await c.getInstantMix(item.Id, 100).catch(() => []);
    if (mix.length) usePlayer.getState().playQueue(mix, 0, { shuffle: false });
    else toast("Couldn't start radio for this.");
  }
}

export function goToAlbum(item: BaseItem) {
  if (item.AlbumId) go({ name: 'album', id: item.AlbumId });
}

export function goToArtist(item: BaseItem) {
  const id = item.Type === 'MusicArtist' ? item.Id : (item.AlbumArtists?.[0]?.Id ?? item.ArtistItems?.[0]?.Id);
  if (id) go({ name: 'artist', id });
}

function playlistsChanged(ids: string[] | null) {
  void queryClient.invalidateQueries({ predicate: (q) => ['allPlaylists', 'playlistItems', 'item'].includes(q.queryKey[0] as string) });
  emitPlaylistsChanged(ids);
}

export async function createPlaylist(items: BaseItem[] = []): Promise<string | null> {
  const c = client();
  const name = await askText('New Playlist', '', 'Create');
  if (!c || !name) return null;
  try {
    const songs = (await Promise.all(items.map(songsOf))).flat();
    const id = await c.createPlaylist(name, songs.map((s) => s.Id));
    playlistsChanged([id]);
    toast(songs.length ? `Added to ${name}` : `Created ${name}`);
    return id;
  } catch {
    toast(`Couldn’t create ${name}`);
    return null;
  }
}

export async function removeFromPlaylist(playlistId: string, items: BaseItem[]) {
  const c = client();
  const entries = items.map((i) => i.PlaylistItemId).filter((x): x is string => !!x);
  if (!c || !entries.length) return;
  // Off the list now; back if the server says no.
  const key = ['playlistItems', c.session.userId, playlistId];
  const before = queryClient.getQueryData<BaseItem[]>(key);
  if (before) queryClient.setQueryData(key, before.filter((s) => !s.PlaylistItemId || !entries.includes(s.PlaylistItemId)));
  toast(entries.length === 1 ? 'Removed from this playlist' : `${entries.length} songs removed`);
  try {
    await c.removeFromPlaylist(playlistId, entries);
    playlistsChanged([playlistId]);
  } catch {
    if (before) queryClient.setQueryData(key, before);
    toast(entries.length === 1 ? 'Couldn’t remove the song' : 'Couldn’t remove the songs');
  }
}

export async function renamePlaylist(playlist: BaseItem) {
  const c = client();
  const name = await askText('Rename playlist', playlist.Name, 'Rename');
  if (!c || !name || name === playlist.Name) return;
  const old = playlist.Name;
  patchItem(playlist.Id, (p) => ({ ...p, Name: name }));
  try {
    await c.renamePlaylist(playlist.Id, name);
    playlistsChanged([playlist.Id]);
  } catch {
    patchItem(playlist.Id, (p) => ({ ...p, Name: old }));
    toast(`Couldn’t rename ${old}`);
  }
}

/** Pick a picture on this computer and make it the playlist's cover. */
export function changePlaylistPicture(playlist: BaseItem) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.onchange = () => {
    const file = input.files?.[0];
    const c = client();
    if (!file || !c) return;
    if (file.size > 15 * 1024 * 1024) return toast('That picture is too big: pick one under 15 MB');
    const reader = new FileReader();
    reader.onload = async () => {
      // "data:image/png;base64,AAAA" -> the base64 part, which is what Jellyfin takes.
      const base64 = String(reader.result).split(',')[1] ?? '';
      // The new picture shows at once (ui/parts.tsx Artwork) while it uploads.
      showLocalPicture(playlist.Id, URL.createObjectURL(file));
      try {
        await c.uploadItemImage(playlist.Id, base64, file.type || 'image/jpeg');
        // The new picture has a new tag, so every view loads it.
        playlistsChanged([playlist.Id]);
        toast('Playlist picture updated');
      } catch (e) {
        showLocalPicture(playlist.Id, null);
        toast(`Couldn’t change the picture: ${e instanceof Error ? e.message : 'try again'}`);
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

/**
 * Move a song within a playlist (drag and drop). The list changes at once; if the server
 * says no, it's reloaded.
 */
export async function movePlaylistSong(playlistId: string, from: number, to: number) {
  const c = client();
  if (!c || from === to) return;
  const key = ['playlistItems', c.session.userId, playlistId];
  const songs = queryClient.getQueryData<BaseItem[]>(key);
  const entry = songs?.[from]?.PlaylistItemId;
  if (!songs || !entry) return;
  const next = [...songs];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  queryClient.setQueryData(key, next);
  try {
    await c.movePlaylistItem(playlistId, entry, to);
  } catch {
    toast('Couldn’t move the song');
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export async function deletePlaylist(playlist: BaseItem) {
  const c = client();
  if (!c) return;
  const ok = await confirmAction(`Delete ${playlist.Name}?`, 'The playlist goes from your server for every app. The songs stay.', 'Delete');
  if (!ok) return;
  // Gone from the lists now; back if the server says no.
  patchItem(playlist.Id, 'remove');
  go({ name: 'playlists' });
  toast(`Deleted ${playlist.Name}`);
  try {
    await c.deletePlaylist(playlist.Id);
  } catch {
    toast(`Couldn’t delete ${playlist.Name}`);
  }
  playlistsChanged(null);
}
