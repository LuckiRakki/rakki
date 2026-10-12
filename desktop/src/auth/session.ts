// The signed-in Jellyfin account, kept between launches (localStorage, in the app's own data
// folder). The client is Rakki's shared one (src/api/jellyfin.ts in the phone app).
import { create } from 'zustand';

import { JellyfinClient, type Session } from '@/api/jellyfin';

const SESSION_KEY = 'rakki.session';
const DEVICE_KEY = 'rakki.deviceId';

function readSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
  } catch {
    return null;
  }
}

/** This install's id for Jellyfin (its Devices list), made once. */
export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `rakki-desktop-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

interface AuthState {
  session: Session | null;
  client: JellyfinClient | null;
  signIn(session: Session): void;
  signOut(): void;
}

const initial = readSession();

export const useAuth = create<AuthState>((set) => ({
  session: initial,
  client: initial ? new JellyfinClient(initial) : null,
  signIn(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    set({ session, client: new JellyfinClient(session) });
  },
  signOut() {
    localStorage.removeItem(SESSION_KEY);
    set({ session: null, client: null });
  },
}));

/** The client, for code outside React (the player). */
export function client(): JellyfinClient | null {
  return useAuth.getState().client;
}
