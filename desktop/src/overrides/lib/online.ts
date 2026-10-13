// Whether the server answers, for the shared Jellyfin client (the phone app's version also
// follows the phone's network; a desktop just goes by whether requests get through). While it
// doesn't, Rakki asks again after 5, 10, 20 s and then every 30 s; when it answers, whatever
// failed to load loads again (main.tsx `watchServer`).
import { create } from 'zustand';

export const useServerReachable = create<{ reachable: boolean }>(() => ({ reachable: true }));

const RETRY_STEPS_MS = [5_000, 10_000, 20_000, 30_000];
let retry: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let target: { url(): string | undefined; back(): void } | null = null;

/** Where to ask (the signed-in server), and what to do once it answers again. */
export function watchServer(t: { url(): string | undefined; back(): void }) {
  target = t;
}

export function isOffline(): boolean {
  return false;
}

export function useOffline(): boolean {
  return false;
}

async function ping(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    return (await fetch(`${url}/System/Ping`, { signal: controller.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the server now (Try again, or the next scheduled try). */
export async function probe(): Promise<void> {
  if (retry) clearTimeout(retry);
  retry = null;
  const url = target?.url();
  if (!url) return;
  if (await ping(url)) reportConnectionSuccess();
  else schedule();
}

function schedule() {
  if (retry) return;
  retry = setTimeout(() => void probe(), RETRY_STEPS_MS[Math.min(failures++, RETRY_STEPS_MS.length - 1)]);
}

export function reportConnectionFailure() {
  if (useServerReachable.getState().reachable) useServerReachable.setState({ reachable: false });
  schedule();
}

export function reportConnectionSuccess() {
  failures = 0;
  if (retry) clearTimeout(retry);
  retry = null;
  if (useServerReachable.getState().reachable) return;
  useServerReachable.setState({ reachable: true });
  target?.back();
}
