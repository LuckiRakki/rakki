// Signing in, switching and signing out of accounts. Before another account takes over, the
// active one is wrapped up: its queue saved, playback stopped, downloads paused, cached server
// data dropped (everything per-account reloads for the next one).
import type { Session } from '@/api/jellyfin';
import { queryClient } from '@/api/queries';
import { accountKey, useAuth } from '@/auth/store';
import { removeAllDownloads, stopDownloads } from '@/downloads/manager';
import { suspendQueueForSwitch, usePlayer } from '@/player/store';

function leaveCurrentAccount() {
  suspendQueueForSwitch();
  usePlayer.getState().stop();
  stopDownloads();
  queryClient.clear();
}

/** Sign in (first account, or "Add account"): the new account becomes the active one. */
export async function signInAccount(session: Session) {
  if (useAuth.getState().session) leaveCurrentAccount();
  await useAuth.getState().signIn(session);
}

/** Make another signed-in account the active one. */
export async function switchAccount(session: Session) {
  const current = useAuth.getState().session;
  if (current && accountKey(current) === accountKey(session)) return;
  leaveCurrentAccount();
  await useAuth.getState().switchTo(session);
}

/**
 * Sign out of the active account: its downloads are removed from this iPhone, and the next
 * signed-in account (if any) takes over; otherwise back to the sign-in screen.
 */
export async function signOut() {
  const current = useAuth.getState().session;
  if (!current) return;
  removeAllDownloads();
  leaveCurrentAccount();
  await useAuth.getState().removeAccount(accountKey(current));
}

/** Forget an account that isn't the active one (its downloads stay until it's signed in again). */
export async function removeAccount(session: Session) {
  const current = useAuth.getState().session;
  if (current && accountKey(current) === accountKey(session)) return signOut();
  await useAuth.getState().removeAccount(accountKey(session));
}
