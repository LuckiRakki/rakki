// Daily Mixes: playlists the Rakki plugin writes every night, named "[Rakki] Daily Mix 1" to
// "6" (docs/DAILY_MIX.md). Rakki keeps them out of the usual playlist places (Library →
// Playlists, Home's "Your playlists", Add to playlist, search, the "in a playlist" heart) and
// shows them on their own Home shelf, as "Daily Mix 1" with the mix's lead artists under it.
import type { BaseItem } from '@/api/jellyfin';

const PREFIX = '[Rakki] ';

/** One of the plugin's playlists (a Daily Mix). */
export function isMix(item: Pick<BaseItem, 'Type' | 'Name'> | null | undefined): boolean {
  return !!item && item.Type === 'Playlist' && !!item.Name?.startsWith(PREFIX);
}

/** The name to show: "Daily Mix 1" for a mix, the name as is otherwise. */
export function displayName(item: Pick<BaseItem, 'Type' | 'Name'> | null | undefined): string {
  const name = item?.Name ?? '';
  return isMix(item) ? name.slice(PREFIX.length) : name;
}

/** "Paramore, Hayley Williams and more" (the start of the overview the plugin writes). */
export function mixArtists(item: BaseItem): string {
  const first = item.Overview?.split('. ')[0]?.trim() ?? '';
  return first.endsWith('and more') ? first : 'Daily Mix';
}

/** The mix's number, for ordering. */
export function mixNumber(item: BaseItem): number {
  return Number(item.Name?.match(/(\d+)\s*$/)?.[1] ?? 99);
}
