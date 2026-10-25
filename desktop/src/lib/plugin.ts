// The Rakki plugin on the server (server/ in this repo), for what only the desktop app asks of
// it so far: audio edits (audio/edits.ts) and lyrics you make (lyrics/maker.ts). Both arrived
// in plugin 0.3; `usePluginVersion` says which one the server has.
import { create } from 'zustand';

import { useAuth } from '~/auth/session';

export class PluginError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

/** A request to the server as the signed-in user. 404 comes back as null. */
export async function pluginRequest<T>(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: string, type = 'application/json'): Promise<T | null> {
  const s = useAuth.getState().session;
  if (!s) throw new PluginError("You're not signed in.");
  let res: Response;
  try {
    res = await fetch(`${s.serverUrl}${path}`, {
      method,
      body,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': type }),
        Authorization: `MediaBrowser Client="Rakki", DeviceId="${s.deviceId}", Token="${s.token}"`,
      },
    });
  } catch {
    throw new PluginError("Couldn't reach the server.");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new PluginError((await res.text().catch(() => '')).slice(0, 200) || `Server error ${res.status}`, res.status);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** The plugin's version ("0.3.0.0"), '' without the plugin, null until asked. */
export const usePluginVersion = create<{ version: string | null }>(() => ({ version: null }));

let asked: Promise<string> | null = null;

/** Asks the server once per sign-in (again after signing in as someone else). */
export function pluginVersion(): Promise<string> {
  asked ??= pluginRequest<{ Version: string }>('GET', '/Rakki/Info')
    .then((i) => i?.Version ?? '')
    .catch(() => {
      asked = null;
      return '';
    })
    .then((version) => {
      usePluginVersion.setState({ version });
      return version;
    });
  return asked;
}

useAuth.subscribe((s, prev) => {
  if (s.session?.token !== prev.session?.token) {
    asked = null;
    usePluginVersion.setState({ version: null });
  }
});

/** At least `want` ("0.3"), by number. */
export function versionAtLeast(have: string | null, want: string): boolean {
  if (!have) return false;
  const a = have.split('.').map(Number);
  const b = want.split('.').map(Number);
  for (let i = 0; i < b.length; i++) {
    if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i];
  }
  return true;
}

/** The server can keep audio edits and lyrics you make (plugin 0.3 or later). */
export function useEditsAvailable(): boolean {
  const version = usePluginVersion((s) => s.version);
  if (version === null) void pluginVersion();
  return versionAtLeast(version, '0.3');
}
