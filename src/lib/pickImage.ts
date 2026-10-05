// Picking a picture to upload (profile picture, playlist cover): from Photos, cropped square
// (builds from 0.2.0), or from Files (JPEG or PNG) on older builds.
import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const photosAvailable = Platform.OS === 'ios' && !!requireOptionalNativeModule('ExponentImagePicker');

export interface PickedImage {
  base64: () => Promise<string>;
  mime: string;
  size: number;
}

/** From Photos, cropped to a square (the picker re-saves it as a JPEG). */
async function pickPhoto(): Promise<PickedImage | null> {
  const ImagePicker = await import('expo-image-picker');
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
    base64: true,
  });
  const asset = r.canceled ? null : r.assets[0];
  if (!asset?.base64) return null;
  const base64 = asset.base64;
  return { base64: async () => base64, mime: 'image/jpeg', size: asset.fileSize ?? (base64.length * 3) / 4 };
}

async function pickFile(): Promise<PickedImage | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['image/jpeg', 'image/png'] });
  if (picked.canceled || !picked.result) return null;
  const file = picked.result;
  return {
    base64: () => file.base64(),
    mime: file.type || (file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'),
    size: file.size ?? 0,
  };
}

/** A square picture to upload, or null if the user cancelled. */
export async function pickImage(): Promise<PickedImage | null> {
  try {
    return photosAvailable ? await pickPhoto() : await pickFile();
  } catch {
    return null;
  }
}
