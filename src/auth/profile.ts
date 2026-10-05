// Change your Jellyfin profile picture from Rakki: pick a photo (cropped square) and upload it.
// Builds from before 0.2.0 have no photo picker, so there it's the Files picker (JPEG or PNG
// from Files, iCloud Drive…). See lib/pickImage.ts.
import { Alert, Platform } from 'react-native';

import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { MAX_IMAGE_BYTES, pickImage } from '@/lib/pickImage';
import { showToast } from '@/ui/overlays';

export async function changeProfilePicture() {
  const client = useAuth.getState().client;
  if (!client) return;
  if (Platform.OS === 'web') {
    showToast('Change your picture in the iPhone app');
    return;
  }
  const picked = await pickImage();
  if (!picked) return;
  if (picked.size > MAX_IMAGE_BYTES) {
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
