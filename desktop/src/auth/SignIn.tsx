// Signing in: the server's address, then a password or Quick Connect (a code to approve from
// another signed-in Jellyfin app).
import { useEffect, useState } from 'react';

import {
  authenticateByName,
  authenticateWithQuickConnect,
  getPublicInfo,
  normalizeServerUrl,
  quickConnectEnabled,
  quickConnectInitiate,
  quickConnectState,
} from '@/api/jellyfin';
import { deviceId, useAuth } from '~/auth/session';

export function SignIn() {
  const [server, setServer] = useState(localStorage.getItem('rakki.lastServer') ?? '');
  const [found, setFound] = useState<{ url: string; name: string; quick: boolean } | null>(null);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<{ code: string; secret: string } | null>(null);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const url = normalizeServerUrl(server);
      const info = await getPublicInfo(url, deviceId());
      localStorage.setItem('rakki.lastServer', url);
      setFound({ url, name: info.ServerName, quick: await quickConnectEnabled(url, deviceId()) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach that server.");
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!found) return;
    setError(null);
    setBusy(true);
    try {
      const auth = await authenticateByName(found.url, deviceId(), user.trim(), password);
      useAuth.getState().signIn({ serverUrl: found.url, serverName: found.name, deviceId: deviceId(), ...auth });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  const startQuickConnect = async () => {
    if (!found) return;
    setError(null);
    try {
      const r = await quickConnectInitiate(found.url, deviceId());
      setCode({ code: r.Code, secret: r.Secret });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start Quick Connect.");
    }
  };

  // Waiting for the code to be approved elsewhere.
  useEffect(() => {
    if (!code || !found) return;
    const id = setInterval(async () => {
      try {
        const state = await quickConnectState(found.url, deviceId(), code.secret);
        if (!state.Authenticated) return;
        clearInterval(id);
        const auth = await authenticateWithQuickConnect(found.url, deviceId(), code.secret);
        useAuth.getState().signIn({ serverUrl: found.url, serverName: found.name, deviceId: deviceId(), ...auth });
      } catch {
        // Keep waiting.
      }
    }, 2500);
    return () => clearInterval(id);
  }, [code, found]);

  return (
    <div className="signin">
      {!found ? (
        <form onSubmit={connect}>
          <h1>
            Rakki<b>.</b>
          </h1>
          <p>Your Jellyfin music, word by word.</p>
          <input className="field" placeholder="Server address, e.g. 192.168.1.20:8096" value={server} onChange={(e) => setServer(e.target.value)} autoFocus />
          {error ? <div className="error">{error}</div> : null}
          <button className="primary" disabled={busy || !server.trim()}>
            {busy ? 'Connecting...' : 'Continue'}
          </button>
        </form>
      ) : code ? (
        <form onSubmit={(e) => e.preventDefault()}>
          <h1>Quick Connect</h1>
          <p>In another Jellyfin app that's signed in (the web app, or Rakki on your phone), approve this code:</p>
          <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '0.2em', textAlign: 'center', padding: '10px 0' }}>{code.code}</div>
          <p className="muted">Waiting for approval...</p>
          <button type="button" className="secondary" onClick={() => setCode(null)}>
            Back
          </button>
        </form>
      ) : (
        <form onSubmit={signIn}>
          <h1>Sign in</h1>
          <p>to {found.name}</p>
          <input className="field" placeholder="Username" value={user} onChange={(e) => setUser(e.target.value)} autoFocus />
          <input className="field" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error ? <div className="error">{error}</div> : null}
          <button className="primary" disabled={busy || !user.trim()}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
          {found.quick ? (
            <button type="button" className="secondary" onClick={() => void startQuickConnect()}>
              Use Quick Connect
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={() => setFound(null)}>
            Different server
          </button>
        </form>
      )}
    </div>
  );
}
