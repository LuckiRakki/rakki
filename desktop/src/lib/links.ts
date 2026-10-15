// Opening a web address in the computer's browser (the app's webview never navigates away).
import { openUrl } from '@tauri-apps/plugin-opener';

import { inTauri } from '~/lib/tauri';

export function openLink(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  if (inTauri) void openUrl(url).catch(() => {});
  else window.open(url, '_blank', 'noopener');
}
