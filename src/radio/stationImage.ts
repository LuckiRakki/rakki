// Your own picture for a station, saved in Rakki's hidden folder (.rakki/stations/). Stations
// keep only the file name: the app's folder moves when iOS reinstalls or updates it.
import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const FOLDER = ['.rakki', 'stations'] as const;
const photosAvailable = Platform.OS === 'ios' && !!requireOptionalNativeModule('ExponentImagePicker');

/** Pictures need the phone's file system: not in the web preview. */
export const stationImagesSupported = Platform.OS !== 'web';

/** The picture's address on the phone, from the name the station keeps. */
export function stationImageUri(name: string | undefined): string | undefined {
  if (!name || !stationImagesSupported) return undefined;
  return new File(Paths.document, ...FOLDER, name).uri;
}

/**
 * Pick a picture (from Photos, cropped square; from Files on builds before 0.2.0) and save it.
 * Returns its file name, or null if nothing was picked. Each pick gets a new name, so the old
 * picture never shows from the image cache.
 */
export async function pickStationImage(stationId: string): Promise<string | null> {
  let from: File;
  if (photosAvailable) {
    const ImagePicker = await import('expo-image-picker');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    const asset = r.canceled ? null : r.assets[0];
    if (!asset) return null;
    from = new File(asset.uri);
  } else {
    const picked = await File.pickFileAsync({ mimeTypes: ['image/jpeg', 'image/png'] });
    if (picked.canceled || !picked.result) return null;
    from = picked.result;
  }
  const dir = new Directory(Paths.document, ...FOLDER);
  dir.create({ intermediates: true, idempotent: true });
  const name = `${stationId}-${Date.now().toString(36)}.${/\.png$/i.test(from.uri) ? 'png' : 'jpg'}`;
  from.copy(new File(dir, name));
  return name;
}

/** Delete a picture that's no longer used. */
export function deleteStationImage(name: string | undefined) {
  if (!name || !stationImagesSupported) return;
  try {
    const file = new File(Paths.document, ...FOLDER, name);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}
