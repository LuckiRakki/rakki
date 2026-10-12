// No offline files on the desktop yet (see overrides/downloads/store.ts).
export const downloadsSupported = false;

export function lyricsFile(_itemId: string): { json(): Promise<unknown> } {
  return { json: async () => null };
}
