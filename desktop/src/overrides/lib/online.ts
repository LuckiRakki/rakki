// Whether the server answers, for the shared Jellyfin client (the phone app's version also
// follows the phone's network; a desktop just goes by whether requests get through).
import { create } from 'zustand';

export const useServerReachable = create<{ reachable: boolean }>(() => ({ reachable: true }));

export function isOffline(): boolean {
  return false;
}

export function useOffline(): boolean {
  return false;
}

export function reportConnectionFailure() {
  useServerReachable.setState({ reachable: false });
}

export function reportConnectionSuccess() {
  if (!useServerReachable.getState().reachable) useServerReachable.setState({ reachable: true });
}
