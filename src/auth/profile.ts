// Change your Jellyfin profile picture from Rakki: pick a JPEG or PNG in the iOS file picker
// (Files, iCloud Drive…) and upload it. Picking straight from Photos needs a native photo
// picker, planned for the final build.
import { File } from 'expo-file-system';
import { Alert, Platform } from 'react-native';

import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { showToast } from '@/ui/overlays';

const MAX_BYTES = 15 * 1024 * 1024;

export async function changeProfilePicture() {
  const client = useAuth.getState().client;
  if (!client) return;
  if (Platform.OS === 'web') {
    showToast('Change your picture in the iPhone app');
    return;
  }
  let file: File;
  try {
    const picked = await File.pickFileAsync({ mimeTypes: ['image/jpeg', 'image/png'] });
    if (picked.canceled || !picked.result) return;
    file = picked.result;
  } catch {
    return;
  }
  if ((file.size ?? 0) > MAX_BYTES) {
    Alert.alert('That picture is too big', 'Pick one under 15 MB.');
    return;
  }
  const mime = file.type || (file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
  showToast('Uploading your picture…');
  try {
    await client.uploadUserImage(await file.base64(), mime);
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    showToast('Profile picture updated');
  } catch (e) {
    Alert.alert('Couldn’t change your picture', e instanceof Error ? e.message : 'Try again.');
  }
}
