// Is there a newer Rakki desktop? The newest published desktop-v* release on GitHub (made by
// .github/workflows/desktop.yml) against this version; checked at launch and twice a day.
// A newer one shows an Update button that opens its download page.
import { openUrl } from '@tauri-apps/plugin-opener';
import { create } from 'zustand';

import { inTauri } from '~/lib/tauri';
import pkg from '../../package.json';

const RELEASES = 'https://api.github.com/repos/LuckiRakki/rakki/releases?per_page=30';
const EVERY = 12 * 3600_000;

export const useUpdate = create<{ version: string | null; url: string | null }>(() => ({ version: null, url: null }));

/** a.b.c newer than x.y.z? */
function newer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

async function check() {
  try {
    const list = (await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } }).then((r) => r.json())) as {
      tag_name: string;
      html_url: string;
      draft: boolean;
    }[];
    const latest = list.find((r) => !r.draft && r.tag_name.startsWith('desktop-v'));
    const version = latest?.tag_name.slice('desktop-v'.length);
    if (latest && version && newer(version, pkg.version)) useUpdate.setState({ version, url: latest.html_url });
  } catch {
    // Offline or GitHub busy: next time.
  }
}

let started = false;

export function startUpdateCheck() {
  if (started || !inTauri) return;
  started = true;
  void check();
  setInterval(() => void check(), EVERY);
}

export function openUpdate() {
  const { url } = useUpdate.getState();
  if (url) void openUrl(url);
}
