// The genre tiles from last time (Search's Browse All, Library's Genres, on the phone and the
// desktop), kept on the device per account. They show at once, in place, while the list loads
// again behind them, and are swapped for the new list when it arrives. So the genres are never
// a blank gap (they used to vanish whenever the list had to load again: on launch, after a while
// away from Search, or after switching servers).
import type { GenreCount } from '@/api/jellyfin';
import { readPref, writePref } from '@/lib/prefs';

const key = (userId: string) => `rakki.lastGenres.${userId}`;

/** Last time's genres for this account, if any. */
export function lastGenres(userId: string | undefined): GenreCount[] | undefined {
  if (!userId) return undefined;
  try {
    const saved: unknown = JSON.parse(readPref(key(userId)) ?? 'null');
    return Array.isArray(saved) && saved.length ? (saved as GenreCount[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Keep the new list (only what a tile needs: the name, the count and one cover). */
export function keepGenres(userId: string | undefined, genres: GenreCount[]): GenreCount[] {
  if (!userId) return genres;
  const slim = genres.map((g) => ({
    name: g.name,
    count: g.count,
    album: g.album && {
      Id: g.album.Id,
      Name: g.album.Name,
      Type: g.album.Type,
      ImageTags: g.album.ImageTags?.Primary ? { Primary: g.album.ImageTags.Primary } : undefined,
      ImageBlurHashes: g.album.ImageBlurHashes?.Primary ? { Primary: g.album.ImageBlurHashes.Primary } : undefined,
    },
  }));
  writePref(key(userId), JSON.stringify(slim));
  return genres;
}
