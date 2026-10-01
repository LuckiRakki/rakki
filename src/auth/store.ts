import { create } from 'zustand';

import { JellyfinClient, type Session } from '@/api/jellyfin';
import { getItem, removeItem, setItem } from '@/lib/storage';

const SESSION_KEY = 'rakki.session';
const ACCOUNTS_KEY = 'rakki.accounts';
const DEVICE_KEY = 'rakki.deviceId';
const LAST_SERVER_KEY = 'rakki.lastServer';

function newDeviceId(): string {
  let id = '';
  for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

/** One signed-in account = one user on one server. */
export const accountKey = (s: Pick<Session, 'serverUrl' | 'userId'>) => `${s.serverUrl}|${s.userId}`;

interface AuthState {
  status: 'loading' | 'ready';
  deviceId: string;
  lastServer: string;
  /** Every account signed in on this phone (the active one included), in the order added. */
  accounts: Session[];
  session: Session | null;
  client: JellyfinClient | null;
  load(): Promise<void>;
  /** Add (or refresh) an account and make it the active one. */
  signIn(session: Session): Promise<void>;
  /** Make another signed-in account the active one. */
  switchTo(session: Session): Promise<void>;
  /** Forget an account; if it was the active one, the next account (if any) takes over. */
  removeAccount(key: string): Promise<void>;
}

async function saveAccounts(accounts: Session[]) {
  await setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  deviceId: '',
  lastServer: '',
  accounts: [],
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
    let accounts: Session[] = [];
    try {
      const raw = await getItem(SESSION_KEY);
      session = raw ? (JSON.parse(raw) as Session) : null;
      const rawAccounts = await getItem(ACCOUNTS_KEY);
      accounts = rawAccounts ? (JSON.parse(rawAccounts) as Session[]) : [];
    } catch {
      session = null;
    }
    // Signed in before accounts existed: that session becomes the first account.
    if (session && !accounts.some((a) => accountKey(a) === accountKey(session!))) {
      accounts = [...accounts, session];
      await saveAccounts(accounts);
    }
    set({
      status: 'ready',
      deviceId,
      lastServer,
      accounts,
      session,
      client: session ? new JellyfinClient(session) : null,
    });
  },

  async signIn(session) {
    const key = accountKey(session);
    const exists = get().accounts.some((a) => accountKey(a) === key);
    const accounts = exists ? get().accounts.map((a) => (accountKey(a) === key ? session : a)) : [...get().accounts, session];
    await saveAccounts(accounts);
    await setItem(SESSION_KEY, JSON.stringify(session));
    await setItem(LAST_SERVER_KEY, session.serverUrl);
    set({ accounts, session, client: new JellyfinClient(session), lastServer: session.serverUrl });
  },

  async switchTo(session) {
    await setItem(SESSION_KEY, JSON.stringify(session));
    set({ session, client: new JellyfinClient(session) });
  },

  async removeAccount(key) {
    const accounts = get().accounts.filter((a) => accountKey(a) !== key);
    await saveAccounts(accounts);
    const current = get().session;
    if (current && accountKey(current) === key) {
      const next = accounts[0] ?? null;
      if (next) await setItem(SESSION_KEY, JSON.stringify(next));
      else await removeItem(SESSION_KEY);
      set({ accounts, session: next, client: next ? new JellyfinClient(next) : null });
    } else {
      set({ accounts });
    }
  },
}));
