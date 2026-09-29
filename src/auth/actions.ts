import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { usePlayer } from '@/player/store';

export async function signOut() {
  usePlayer.getState().stop();
  queryClient.clear();
  await useAuth.getState().signOut();
}
