// Things you can do to any item (song, album, playlist, artist) from menus and pages.
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
