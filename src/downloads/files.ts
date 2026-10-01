// Where downloads live on the phone: Documents/downloads/<itemId>.<ext> for audio,
// .../art/<itemId>.jpg for cover art, .../lyrics/<itemId>.json for lyrics. Documents is never
// purged by iOS (unlike Caches). It is included in iCloud backups for now; excluding it needs
// a native call, planned for the Phase 6 native build.
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/** Downloads need the phone's file system: not available in the web preview. */
export const downloadsSupported = Platform.OS !== 'web';

let dirs: { audio: Directory; art: Directory; lyrics: Directory } | null = null;

function ensureDirs() {
  if (dirs) return dirs;
  const audio = new Directory(Paths.document, 'downloads');
  const art = new Directory(audio, 'art');
  const lyrics = new Directory(audio, 'lyrics');
  for (const d of [audio, art, lyrics]) d.create({ intermediates: true, idempotent: true });
  dirs = { audio, art, lyrics };
  return dirs;
}

export function audioFile(name: string): File {
  return new File(ensureDirs().audio, name);
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

/** Remove every downloaded file (Settings → Remove all downloads). */
export function deleteAllFiles() {
  if (!downloadsSupported) return;
  try {
    const audio = new Directory(Paths.document, 'downloads');
    if (audio.exists) audio.delete();
  } catch {
    // Nothing to delete.
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
