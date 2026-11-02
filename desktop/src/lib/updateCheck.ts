// Updates, a click like the phone's: at launch and twice a day Rakki asks GitHub for the newest
// desktop release (latest.json, published by .github/workflows/desktop.yml and signed with
// Rakki's own key, so only real Rakki builds install). A newer one shows an Update button in the
// title bar; one click downloads it (the button shows how far), installs it and restarts Rakki.
// The work is in src-tauri/src/update.rs, which also finds a Linux AppImage that Gear Lever or
// AppImageLauncher moved after it started. The dev build (npm run app:dev) never looks: an
// update would install the release Rakki over the installed one.
import { Channel, invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

import { inTauri } from '~/lib/tauri';
import { toast } from '~/ui/overlays';

const EVERY = 12 * 3600_000;

interface UpdateState {
  /** The newer version, when there is one. */
  version: string | null;
  /** 0-1 while downloading; null otherwise. */
  progress: number | null;
}

export const useUpdate = create<UpdateState>(() => ({ version: null, progress: null }));

async function look() {
  if (useUpdate.getState().progress !== null) return;
  try {
    const version = await invoke<string | null>('update_check');
    if (version) useUpdate.setState({ version });
  } catch {
    // Offline, GitHub busy, or no release yet: next time.
  }
}

let started = false;

export function startUpdateCheck() {
  if (started || !inTauri || import.meta.env.DEV) return;
  started = true;
  void look();
  setInterval(() => void look(), EVERY);
}

/** Download, install, restart. */
export async function installUpdate() {
  const { version, progress } = useUpdate.getState();
  if (!version || import.meta.env.DEV || progress !== null) return;
  useUpdate.setState({ progress: 0 });
  const onProgress = new Channel<{ got: number; total: number | null }>();
  onProgress.onmessage = ({ got, total }) => {
    if (total) useUpdate.setState({ progress: Math.min(1, got / total) });
  };
  try {
    // Installs, then restarts into the new version (Windows' installer closes Rakki itself).
    await invoke('update_install', { onProgress });
  } catch (e) {
    useUpdate.setState({ progress: null });
    toast(`Couldn’t update: ${e instanceof Error ? e.message : String(e)}`);
  }
}
