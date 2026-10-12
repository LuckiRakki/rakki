// The right-click menu for each kind of thing (the phone app's long-press menus, plus what a
// desktop expects). `items` is the selection when several songs are selected.
import {
  Disc3,
  ImagePlus,
  Heart,
  HeartOff,
  ListEnd,
  ListPlus,
  ListStart,
  Pencil,
  Play,
  PlusCircle,
  Radio,
  Shuffle,
  Trash2,
  User,
  X,
} from 'lucide-react';

import type { BaseItem } from '@/api/jellyfin';
import { isMix } from '@/lib/mixes';
import { openAddToPlaylist } from '~/library/AddToPlaylist';
import {
  addToQueue,
  changePlaylistPicture,
  deletePlaylist,
  goToAlbum,
  goToArtist,
  playItem,
  playNext,
  removeFromPlaylist,
  renamePlaylist,
  setLiked,
  startRadio,
} from '~/library/actions';
import { go } from '~/nav';
import { usePlayer } from '~/player/store';
import type { MenuItem } from '~/ui/overlays';

export interface MenuContext {
  /** Songs in a playlist: offer "Remove from this playlist". */
  playlistId?: string;
  /** A row in the queue: offer "Remove from queue". */
  queueIndex?: number;
}

export function songMenu(items: BaseItem[], ctx: MenuContext = {}): MenuItem[] {
  const one = items.length === 1 ? items[0] : null;
  const allLiked = items.every((i) => i.UserData?.IsFavorite);
  const menu: MenuItem[] = [
    { label: 'Play', icon: Play, run: () => usePlayer.getState().playQueue(items, 0, { shuffle: false }) },
    { label: 'Play next', icon: ListStart, run: () => void playNext(items) },
    { label: 'Add to queue', icon: ListEnd, run: () => void addToQueue(items) },
    { label: 'Add to playlist', icon: PlusCircle, run: () => openAddToPlaylist(items), divider: true },
    allLiked
      ? { label: 'Remove from Liked Songs', icon: HeartOff, run: () => void setLiked(items, false) }
      : { label: 'Add to Liked Songs', icon: Heart, run: () => void setLiked(items, true) },
  ];
  if (one) {
    menu.push({ label: 'Song radio', icon: Radio, run: () => void startRadio(one), divider: true });
    if (one.AlbumId) menu.push({ label: 'Go to album', icon: Disc3, run: () => goToAlbum(one) });
    if (one.ArtistItems?.length || one.AlbumArtists?.length) menu.push({ label: 'Go to artist', icon: User, run: () => goToArtist(one) });
  }
  if (ctx.playlistId) {
    menu.push({ label: 'Remove from this playlist', icon: Trash2, danger: true, divider: true, run: () => void removeFromPlaylist(ctx.playlistId!, items) });
  }
  if (ctx.queueIndex !== undefined) {
    menu.push({ label: 'Remove from queue', icon: X, danger: true, divider: true, run: () => usePlayer.getState().removeAt(ctx.queueIndex!) });
  }
  return menu;
}

export function collectionMenu(item: BaseItem): MenuItem[] {
  const menu: MenuItem[] = [
    { label: 'Play', icon: Play, run: () => void playItem(item, { shuffle: false }) },
    { label: 'Shuffle', icon: Shuffle, run: () => void playItem(item, { shuffle: true }) },
    { label: 'Play next', icon: ListStart, run: () => void playNext([item]) },
    { label: 'Add to queue', icon: ListEnd, run: () => void addToQueue([item]) },
  ];
  if (item.Type === 'MusicAlbum') {
    menu.push(
      { label: 'Add to playlist', icon: ListPlus, run: () => openAddToPlaylist([item]), divider: true },
      item.UserData?.IsFavorite
        ? { label: 'Remove from your albums', icon: HeartOff, run: () => void setLiked([item], false) }
        : { label: 'Save to your albums', icon: Heart, run: () => void setLiked([item], true) },
      { label: 'Album radio', icon: Radio, run: () => void startRadio(item) },
    );
    if (item.AlbumArtists?.length) menu.push({ label: 'Go to artist', icon: User, run: () => goToArtist(item) });
  } else if (item.Type === 'MusicArtist') {
    menu.push(
      { label: 'Artist radio', icon: Radio, run: () => void startRadio(item), divider: true },
      item.UserData?.IsFavorite
        ? { label: 'Unfollow', icon: HeartOff, run: () => void setLiked([item], false) }
        : { label: 'Follow', icon: Heart, run: () => void setLiked([item], true) },
    );
  } else if (item.Type === 'Playlist') {
    menu.push({ label: 'Playlist radio', icon: Radio, run: () => void startRadio(item), divider: true });
    if (!isMix(item)) {
      menu.push(
        { label: 'Rename', icon: Pencil, run: () => void renamePlaylist(item) },
        { label: 'Change picture', icon: ImagePlus, run: () => changePlaylistPicture(item) },
        { label: 'Delete playlist', icon: Trash2, danger: true, run: () => void deletePlaylist(item) },
      );
    }
    menu.push({ label: 'Open', icon: Disc3, run: () => go({ name: 'playlist', id: item.Id }) });
  }
  return menu;
}
