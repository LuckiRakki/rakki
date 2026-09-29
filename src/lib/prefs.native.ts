// Non-secret preferences (settings, appearance) on iOS/Android: SQLite key-value store, with
// synchronous reads so stores can hydrate before the first render. Secrets stay in
// src/lib/storage.ts (Keychain).
import Storage from 'expo-sqlite/kv-store';

export function readPref(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    Storage.setItemSync(key, value);
  } catch {}
}
