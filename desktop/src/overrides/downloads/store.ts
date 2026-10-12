// Downloads (songs saved for offline) aren't on the desktop yet: shared code sees none.
import { create } from 'zustand';

export const useDownloads = create<{ tracks: Record<string, { state?: string; lyrics?: boolean }>; collections: Record<string, never>; rev: number }>(() => ({
  tracks: {},
  collections: {},
  rev: 0,
}));

export function localArtUri(): string | undefined {
  return undefined;
}

export function localAudioUri(): string | undefined {
  return undefined;
}
