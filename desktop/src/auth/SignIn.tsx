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
import { WindowButtons } from '~/layout/TitleBar';
import { kv } from '~/lib/kv';

export function SignIn() {
  const [server, setServer] = useState(kv.getItem('rakki.lastServer') ?? '');
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
      kv.setItem('rakki.lastServer', url);
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
      <div className="titlebar" data-tauri-drag-region>
        <div style={{ flex: 1 }} data-tauri-drag-region />
        <WindowButtons />
      </div>
      <div className="signin-body" data-tauri-drag-region>
        <div className="signin-card">
          <div className="wordmark">
            Rakki<b>.</b>
          </div>
          {!found ? (
            <form onSubmit={connect}>
              <h1>Welcome</h1>
              <p className="muted">Your Jellyfin music, word by word. Enter your server's address to start.</p>
              <label className="field-label">Server Address</label>
              <input className="field" placeholder="e.g. 192.168.1.20:8096 or https://music.example.com" value={server} onChange={(e) => setServer(e.target.value)} autoFocus />
              {error ? <div className="error">{error}</div> : null}
              <button className="primary" disabled={busy || !server.trim()}>
                {busy ? 'Connecting...' : 'Continue'}
              </button>
            </form>
          ) : code ? (
            <form onSubmit={(e) => e.preventDefault()}>
              <h1>Quick Connect</h1>
              <p className="muted">In another Jellyfin app that's signed in (the web app, or Rakki on your phone), approve this code:</p>
              <div className="qc-code">{code.code}</div>
              <p className="muted center">Waiting for approval...</p>
              <button type="button" className="secondary" onClick={() => setCode(null)}>
                Back
              </button>
            </form>
          ) : (
            <form onSubmit={signIn}>
              <h1>Sign In</h1>
              <p className="muted">to {found.name}</p>
              <label className="field-label">Username</label>
              <input className="field" value={user} onChange={(e) => setUser(e.target.value)} autoFocus />
              <label className="field-label">Password</label>
              <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error ? <div className="error">{error}</div> : null}
              <button className="primary" disabled={busy || !user.trim()}>
                {busy ? 'Signing in...' : 'Sign In'}
              </button>
              {found.quick ? (
                <button type="button" className="secondary" onClick={() => void startQuickConnect()}>
                  Use Quick Connect
                </button>
              ) : null}
              <button type="button" className="textbtn center" onClick={() => setFound(null)}>
                Use a Different Server
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
