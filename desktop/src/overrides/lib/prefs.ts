// The phone app's small saved preferences (prefs.native.ts there): on the desktop, Rakki's data
// folder (lib/kv.ts).
import { kv } from '~/lib/kv';

export function readPref(key: string): string | null {
  return kv.getItem(key);
}

export function writePref(key: string, value: string): void {
  kv.setItem(key, value);
}
