// What you can do with songs, albums, artists and playlists, from any menu or button.
import type { BaseItem } from '@/api/jellyfin';
import { emitLikedChanged, emitPlaylistsChanged } from '@/lib/events';
import { buildSmartQueue } from '@/player/smartQueue';
import { client } from '~/auth/session';
import { go } from '~/nav';
import { usePlayer } from '~/player/store';
import { queryClient } from '~/queries';
import { askText, confirmAction, toast } from '~/ui/overlays';

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
  try {
    await Promise.all(items.map((i) => c.setFavorite(i.Id, liked)));
    refreshLiked(items.map((i) => i.Id), liked);
    toast(liked ? (items.length === 1 ? 'Added to Liked Songs' : `${items.length} songs liked`) : 'Removed from Liked Songs');
  } catch (e) {
    toast(e instanceof Error ? e.message : "Couldn't change it.");
  }
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
  void queryClient.invalidateQueries({ predicate: (q) => ['playlists', 'playlistItems', 'mixes', 'item'].includes(q.queryKey[0] as string) });
  emitPlaylistsChanged(ids);
}

export async function createPlaylist(items: BaseItem[] = []): Promise<string | null> {
  const c = client();
  const name = await askText('New playlist', '', 'Create');
  if (!c || !name) return null;
  const songs = (await Promise.all(items.map(songsOf))).flat();
  const id = await c.createPlaylist(name, songs.map((s) => s.Id));
  playlistsChanged([id]);
  toast(songs.length ? `Added to ${name}` : `Created ${name}`);
  return id;
}

export async function removeFromPlaylist(playlistId: string, items: BaseItem[]) {
  const c = client();
  const entries = items.map((i) => i.PlaylistItemId).filter((x): x is string => !!x);
  if (!c || !entries.length) return;
  await c.removeFromPlaylist(playlistId, entries);
  playlistsChanged([playlistId]);
  toast(entries.length === 1 ? 'Removed from this playlist' : `${entries.length} songs removed`);
}

export async function renamePlaylist(playlist: BaseItem) {
  const c = client();
  const name = await askText('Rename playlist', playlist.Name, 'Rename');
  if (!c || !name || name === playlist.Name) return;
  await c.renamePlaylist(playlist.Id, name);
  playlistsChanged([playlist.Id]);
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
      toast('Uploading the picture…');
      try {
        await c.uploadItemImage(playlist.Id, base64, file.type || 'image/jpeg');
        // The new picture has a new tag, so every view loads it.
        playlistsChanged([playlist.Id]);
        toast('Playlist picture updated');
      } catch (e) {
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
  await c.deletePlaylist(playlist.Id);
  playlistsChanged(null);
  go({ name: 'playlists' });
  toast(`Deleted ${playlist.Name}`);
}
