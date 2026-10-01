// Is Rakki online? Offline means: Offline mode is switched on, the phone has no connection, or
// the server doesn't answer (e.g. Tailscale is off). Offline, Rakki shows only downloads and
// server requests fail at once instead of waiting for a timeout.
//
// The server is pinged at sign-in, when the connection changes, when the app comes back to
// the front, after a request fails to connect, and every 30 s while it's unreachable.
import { AppState } from 'react-native';
import { create } from 'zustand';

import { useNetwork } from '@/lib/network';
import { useSettings } from '@/settings/store';

const RETRY_MS = 30_000;
const PING_TIMEOUT_MS = 5_000;

export const useServerReachable = create<{ reachable: boolean }>(() => ({ reachable: true }));

let serverUrl: string | null = null;
let probing = false;
let retry: ReturnType<typeof setTimeout> | null = null;

/** Rakki should act offline right now (for non-React code). */
export function isOffline(): boolean {
  return (
    useSettings.getState().offlineMode || !useNetwork.getState().connected || !useServerReachable.getState().reachable
  );
}

/** Rakki should act offline (re-renders when that changes). */
export function useOffline(): boolean {
  const manual = useSettings((s) => s.offlineMode);
  const connected = useNetwork((s) => s.connected);
  const reachable = useServerReachable((s) => s.reachable);
  return manual || !connected || !reachable;
}

/** Ask the server if it's there. */
export async function probe(): Promise<void> {
  if (!serverUrl || probing) return;
  probing = true;
  if (retry) clearTimeout(retry);
  retry = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  let ok = false;
  try {
    ok = (await fetch(`${serverUrl}/System/Ping`, { signal: controller.signal })).ok;
  } catch {
    ok = false;
  } finally {
    clearTimeout(timer);
    probing = false;
  }
  useServerReachable.setState({ reachable: ok });
  if (!ok) retry = setTimeout(() => void probe(), RETRY_MS);
}

/** Start watching this server (null on sign-out). */
export function watchServer(url: string | null) {
  serverUrl = url;
  useServerReachable.setState({ reachable: true });
  if (url) void probe();
}

let failTimer: ReturnType<typeof setTimeout> | null = null;

/** A request couldn't connect: check whether the server is gone. */
export function reportConnectionFailure() {
  if (failTimer) return;
  failTimer = setTimeout(() => {
    failTimer = null;
    void probe();
  }, 500);
}

/** A request got through, so the server is reachable. */
export function reportConnectionSuccess() {
  if (!useServerReachable.getState().reachable) useServerReachable.setState({ reachable: true });
}

useNetwork.subscribe((s, prev) => {
  if (s.connected !== prev.connected || s.cellular !== prev.cellular) void probe();
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') void probe();
});
