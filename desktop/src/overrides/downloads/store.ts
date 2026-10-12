// Downloads (songs saved for offline) aren't on the desktop yet: shared code sees none.
import { create } from 'zustand';

export const useDownloads = create<{ tracks: Record<string, { state?: string; lyrics?: boolean }> }>(() => ({ tracks: {} }));

export function localArtUri(): string | undefined {
  return undefined;
}

export function localAudioUri(): string | undefined {
  return undefined;
}
