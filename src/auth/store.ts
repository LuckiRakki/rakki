import { create } from 'zustand';

import { JellyfinClient, type Session } from '@/api/jellyfin';
import { getItem, removeItem, setItem } from '@/lib/storage';

const SESSION_KEY = 'rakki.session';
const DEVICE_KEY = 'rakki.deviceId';
const LAST_SERVER_KEY = 'rakki.lastServer';

function newDeviceId(): string {
  let id = '';
  for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

interface AuthState {
  status: 'loading' | 'ready';
  deviceId: string;
  lastServer: string;
  session: Session | null;
  client: JellyfinClient | null;
  load(): Promise<void>;
  signIn(session: Session): Promise<void>;
  signOut(): Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  deviceId: '',
  lastServer: '',
  session: null,
  client: null,

  async load() {
    let deviceId = await getItem(DEVICE_KEY);
    if (!deviceId) {
      deviceId = newDeviceId();
      await setItem(DEVICE_KEY, deviceId);
    }
    const lastServer = (await getItem(LAST_SERVER_KEY)) ?? '';
    let session: Session | null = null;
    try {
      const raw = await getItem(SESSION_KEY);
      session = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      session = null;
    }
    set({
      status: 'ready',
      deviceId,
      lastServer,
      session,
      client: session ? new JellyfinClient(session) : null,
    });
  },

  async signIn(session) {
    await setItem(SESSION_KEY, JSON.stringify(session));
    await setItem(LAST_SERVER_KEY, session.serverUrl);
    set({ session, client: new JellyfinClient(session), lastServer: session.serverUrl });
  },

  async signOut() {
    await removeItem(SESSION_KEY);
    set({ session: null, client: null, lastServer: get().lastServer });
  },
}));
