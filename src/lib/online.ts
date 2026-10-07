// Is Rakki online? Offline means: Offline mode is switched on, the phone has no connection, or
// the server doesn't answer (e.g. Tailscale is off). Offline, Rakki shows only downloads and
// server requests fail at once instead of waiting for a timeout.
//
// The server is pinged at sign-in, when the connection changes, when the app comes back to
// the front, after a request fails to connect, and while it's unreachable (after 5, 10, 20 s,
// then every 30 s). One missed ping doesn't count: phones drop a request or two when they
// move between Wi-Fi and cellular or Tailscale reconnects, so it asks again before going
// offline.
import { AppState } from 'react-native';
import { create } from 'zustand';

import { useNetwork } from '@/lib/network';
import { useSettings } from '@/settings/store';

const PING_TIMEOUT_MS = 6_000;
/** After a missed ping, the second try. */
const CONFIRM_MS = 2_000;
/** While unreachable: how long until the next try (the last step repeats). */
const RETRY_STEPS_MS = [5_000, 10_000, 20_000, 30_000];
/** A new network (Wi-Fi ↔ cellular) gets a moment to settle before the ping. */
const NETWORK_SETTLE_MS = 1_500;

export const useServerReachable = create<{ reachable: boolean }>(() => ({ reachable: true }));

let serverUrl: string | null = null;
let probing = false;
let retry: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

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

async function ping(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    return (await fetch(`${url}/System/Ping`, { signal: controller.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the server if it's there. */
export async function probe(): Promise<void> {
  const url = serverUrl;
  if (!url || probing) return;
  probing = true;
  if (retry) clearTimeout(retry);
  retry = null;
  let ok = await ping(url);
  // Online until now: one miss isn't enough to go offline.
  if (!ok && useServerReachable.getState().reachable) {
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_MS));
    ok = await ping(url);
  }
  probing = false;
  // Signed out or switched servers meanwhile.
  if (url !== serverUrl) return;
  if (ok) {
    failures = 0;
    if (!useServerReachable.getState().reachable) useServerReachable.setState({ reachable: true });
    return;
  }
  failures++;
  useServerReachable.setState({ reachable: false });
  retry = setTimeout(() => void probe(), RETRY_STEPS_MS[Math.min(failures, RETRY_STEPS_MS.length) - 1]);
}

/** Start watching this server (null on sign-out). */
export function watchServer(url: string | null) {
  serverUrl = url;
  failures = 0;
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

let settle: ReturnType<typeof setTimeout> | null = null;
useNetwork.subscribe((s, prev) => {
  if (s.connected === prev.connected && s.cellular === prev.cellular) return;
  if (settle) clearTimeout(settle);
  settle = setTimeout(() => {
    settle = null;
    void probe();
  }, NETWORK_SETTLE_MS);
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') void probe();
});
