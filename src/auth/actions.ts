import { Alert, Platform } from 'react-native';

import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { usePlayer } from '@/player/store';

export async function signOut() {
  usePlayer.getState().stop();
  queryClient.clear();
  await useAuth.getState().signOut();
}

/** Account sheet: shows who's signed in where, offers Sign out. */
export function showAccountSheet() {
  const s = useAuth.getState().session;
  if (!s) return;
  const message = `Signed in as ${s.userName}\n${s.serverName} · ${s.serverUrl}`;
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${message}\n\nSign out?`)) void signOut();
    return;
  }
  Alert.alert('Account', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
  ]);
}
