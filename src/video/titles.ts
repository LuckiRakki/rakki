// Music video titles and matching: plain TypeScript shared by the phone and the desktop.
import type { BaseItem } from '@/api/jellyfin';
import { matchKey } from '@/lib/lastfm';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A video's title without the artist and "(Official Music Video)" bits:
 * "CONFETTI - ARMY STYLE (OFFICIAL MUSIC VIDEO)" → "ARMY STYLE".
 */
export function videoTitle(name: string, artists: string[]): string {
  let title = name.replace(
    /[([][^)\]]*\b(?:official|music video|video|lyrics?|visuali[sz]er|audio|hd|4k|uhd|remastered)\b[^)\]]*[)\]]/gi,
    '',
  );
  for (const artist of artists) title = title.replace(new RegExp(`^\\s*${escape(artist)}\\s*[-–—:|]\\s*`, 'i'), '');
  return title.replace(/\s*[-–—|]\s*(?:official\s+)?(?:music\s+)?video\s*$/i, '').trim();
}

/** A video title reduced to the song title for matching ("army style"). */
export function videoKey(name: string, artists: string[]): string {
  return matchKey(videoTitle(name, artists));
}

/** The music video for a song, if the library has one. */
export function findVideoFor(track: BaseItem, videos: BaseItem[]): BaseItem | undefined {
  if (track.Type !== 'Audio' || !videos.length) return undefined;
  const artists = new Set([...(track.Artists ?? []), track.AlbumArtist ?? ''].filter(Boolean).map(matchKey));
  const title = matchKey(track.Name);
  return videos.find(
    (v) => (v.Artists ?? []).some((a) => artists.has(matchKey(a))) && videoKey(v.Name, v.Artists ?? []) === title,
  );
}

/** An artist's music videos, newest first. */
export function videosByArtist(artist: string | undefined, videos: BaseItem[] | undefined): BaseItem[] {
  if (!artist || !videos?.length) return [];
  const key = matchKey(artist);
  return videos
    .filter((v) => (v.Artists ?? []).some((a) => matchKey(a) === key))
    .sort((a, b) => (b.ProductionYear ?? 0) - (a.ProductionYear ?? 0));
}
