// Updates, a click like the phone's: at launch and twice a day Rakki asks GitHub for the newest
// desktop release (latest.json, published by .github/workflows/desktop.yml and signed with
// Rakki's own key, so only real Rakki builds install). A newer one shows an Update button in the
// title bar; one click downloads it (the button shows how far), installs it and restarts Rakki.
// Linux .deb installs update through the package instead. The dev build (npm run app:dev) never
// looks: an update would install the release Rakki over the installed one.
import { invoke } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
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

let pending: Update | null = null;

async function look() {
  try {
    const u = await check();
    if (u) {
      pending = u;
      useUpdate.setState({ version: u.version });
    }
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
  const u = pending;
  if (!u || import.meta.env.DEV || useUpdate.getState().progress !== null) return;
  let total = 0;
  let got = 0;
  useUpdate.setState({ progress: 0 });
  try {
    await u.downloadAndInstall((e) => {
      if (e.event === 'Started') total = e.data.contentLength ?? 0;
      else if (e.event === 'Progress') {
        got += e.data.chunkLength;
        if (total) useUpdate.setState({ progress: Math.min(1, got / total) });
      }
    });
    // Windows' installer closes Rakki itself; elsewhere, restart into the new version.
    await invoke('app_restart');
  } catch (e) {
    useUpdate.setState({ progress: null });
    toast(`Couldn’t update: ${e instanceof Error ? e.message : String(e)}`);
  }
}
