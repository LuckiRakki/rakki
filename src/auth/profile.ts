// Change your Jellyfin profile picture from Rakki: pick a photo (cropped square) and upload it.
// Builds from before 0.2.0 have no photo picker, so there it's the Files picker (JPEG or PNG
// from Files, iCloud Drive…).
import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';
import { Alert, Platform } from 'react-native';

import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { showToast } from '@/ui/overlays';

const MAX_BYTES = 15 * 1024 * 1024;
const photosAvailable = Platform.OS === 'ios' && !!requireOptionalNativeModule('ExponentImagePicker');

interface Picked {
  base64: () => Promise<string>;
  mime: string;
  size: number;
}

/** From Photos, cropped to a square (the picker re-saves it as a JPEG). */
async function pickPhoto(): Promise<Picked | null> {
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

async function pickFile(): Promise<Picked | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['image/jpeg', 'image/png'] });
  if (picked.canceled || !picked.result) return null;
  const file = picked.result;
  return {
    base64: () => file.base64(),
    mime: file.type || (file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'),
    size: file.size ?? 0,
  };
}

export async function changeProfilePicture() {
  const client = useAuth.getState().client;
  if (!client) return;
  if (Platform.OS === 'web') {
    showToast('Change your picture in the iPhone app');
    return;
  }
  let picked: Picked | null;
  try {
    picked = photosAvailable ? await pickPhoto() : await pickFile();
  } catch {
    return;
  }
  if (!picked) return;
  if (picked.size > MAX_BYTES) {
    Alert.alert('That picture is too big', 'Pick one under 15 MB.');
    return;
  }
  showToast('Uploading your picture…');
  try {
    await client.uploadUserImage(await picked.base64(), picked.mime);
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    showToast('Profile picture updated');
  } catch (e) {
    Alert.alert('Couldn’t change your picture', e instanceof Error ? e.message : 'Try again.');
  }
}
