// Where downloads live on the phone, inside Rakki's Documents folder:
//   Music/<Artist>/<Album>/<01 Title>.<ext>   the songs, readable (Files app → On My iPhone →
//                                              Rakki → Music)
//   .rakki/art/<itemId>.jpg                    cover art   } hidden: Rakki's own data
//   .rakki/lyrics/<itemId>.json                lyrics      }
// Documents is never purged by iOS (unlike Caches). Both folders are kept out of iCloud
// backups (from build 0.2.0; it's a native call): everything in them can be downloaded again.
//
// Update 16 saved songs as downloads/<itemId>.<ext>; the manager moves them on launch.
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { RakkiAudio } from '../../modules/rakki-audio';

/** Downloads need the phone's file system: not available in the web preview. */
export const downloadsSupported = Platform.OS !== 'web';

const MUSIC = 'Music';
const INTERNAL = '.rakki';
const OLD = 'downloads';

let dirs: { music: Directory; art: Directory; lyrics: Directory } | null = null;

function ensureDirs() {
  if (dirs) return dirs;
  const music = new Directory(Paths.document, MUSIC);
  const art = new Directory(Paths.document, INTERNAL, 'art');
  const lyrics = new Directory(Paths.document, INTERNAL, 'lyrics');
  for (const d of [music, art, lyrics]) d.create({ intermediates: true, idempotent: true });
  for (const d of [music, new Directory(Paths.document, INTERNAL)]) RakkiAudio?.excludeFromBackup?.(d.uri);
  dirs = { music, art, lyrics };
  return dirs;
}

/** A name that's safe as a file or folder name on iOS (and readable). */
function safeName(s: string | undefined, fallback: string): string {
  const clean = (s ?? '')
    .replace(/[​-‏⁠﻿]/g, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80)
    .trim();
  return clean || fallback;
}

/**
 * Where a song goes, relative to Music/: "Artist/Album/01 Title.flac". `taken` holds paths
 * already used by other songs, so two songs never share a file.
 */
export function musicPath(item: BaseItem, ext: string, taken: Set<string>): string {
  const artist = safeName(item.AlbumArtist || item.Artists?.[0], 'Unknown Artist');
  const album = safeName(item.Album, 'Unknown Album');
  const disc = item.ParentIndexNumber && item.ParentIndexNumber > 1 ? `${item.ParentIndexNumber}-` : '';
  const num = item.IndexNumber ? `${disc}${String(item.IndexNumber).padStart(2, '0')} ` : '';
  const title = safeName(item.Name, 'Untitled');
  let path = `${artist}/${album}/${num}${title}.${ext}`;
  for (let n = 2; taken.has(path); n++) path = `${artist}/${album}/${num}${title} (${n}).${ext}`;
  return path;
}

/** A downloaded song's file. `path` is relative to Music/ (or an update-16 flat name). */
export function audioFile(path: string): File {
  if (!path.includes('/')) return new File(Paths.document, OLD, path);
  return new File(ensureDirs().music, ...path.split('/'));
}

/** The file for a new download, with its Artist/Album folders created. */
export function prepareAudioFile(path: string): File {
  const parts = path.split('/');
  const folder = new Directory(ensureDirs().music, ...parts.slice(0, -1));
  folder.create({ intermediates: true, idempotent: true });
  return new File(folder, parts[parts.length - 1]);
}

export function artFile(itemId: string): File {
  return new File(ensureDirs().art, `${itemId}.jpg`);
}

export function lyricsFile(itemId: string): File {
  return new File(ensureDirs().lyrics, `${itemId}.json`);
}

export function deleteQuietly(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

/** Delete a song and any Album/Artist folder it leaves empty. */
export function deleteAudio(path: string) {
  const file = audioFile(path);
  deleteQuietly(file);
  if (!path.includes('/')) return;
  try {
    const music = ensureDirs().music.uri;
    let dir = file.parentDirectory;
    while (dir.uri.length > music.length && dir.exists && dir.list().length === 0) {
      const parent = dir.parentDirectory;
      dir.delete();
      dir = parent;
    }
  } catch {
    // Leave the folder.
  }
}

/** Move a file out of update 16's layout into `to`; false if it wasn't there. */
export function moveFromOldLayout(oldRelative: string[], to: File): boolean {
  try {
    const from = new File(Paths.document, OLD, ...oldRelative);
    if (!from.exists) return false;
    deleteQuietly(to);
    from.moveSync(to);
    return true;
  } catch {
    return false;
  }
}

/** True while update 16's folder is still there (so the migration has work to do). */
export function hasOldLayout(): boolean {
  try {
    return new Directory(Paths.document, OLD).exists;
  } catch {
    return false;
  }
}

/** Remove update 16's folder once everything has moved out of it. */
export function removeOldLayout() {
  try {
    const old = new Directory(Paths.document, OLD);
    if (old.exists) old.delete();
  } catch {
    // Try again next launch.
  }
}

/** Remove every downloaded file (Settings → Remove all downloads). */
export function deleteAllFiles() {
  if (!downloadsSupported) return;
  for (const name of [MUSIC, INTERNAL, OLD]) {
    try {
      const d = new Directory(Paths.document, name);
      if (d.exists) d.delete();
    } catch {
      // Nothing to delete.
    }
  }
  dirs = null;
}

/** Free space on the phone, in bytes (null in the web preview). */
export function freeSpace(): number | null {
  if (!downloadsSupported) return null;
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
}
