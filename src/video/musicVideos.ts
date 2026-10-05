// Music videos from Jellyfin's Music Videos library, matched to songs by artist and title.
// Playing one pauses the song. Builds with the in-app video player (expo-video, from the next
// native build) open the video screen; older builds open it in iOS's own player (a Safari
// sheet), which streams the same way.
import { requireOptionalNativeModule } from 'expo';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { matchKey } from '@/lib/lastfm';
import { isOffline } from '@/lib/online';
import { usePlayer } from '@/player/store';
import { showToast } from '@/ui/overlays';
import { useVideoSession } from '@/video/session';

/** Whether this build has the in-app video player. */
export const inAppVideo = Platform.OS !== 'web' && !!requireOptionalNativeModule('ExpoVideo');

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A video title reduced to the song title for matching:
 * "CONFETTI - ARMY STYLE (OFFICIAL MUSIC VIDEO)" → "army style".
 */
export function videoKey(name: string, artists: string[]): string {
  let title = name.replace(
    /[([][^)\]]*\b(?:official|music video|video|lyrics?|visuali[sz]er|audio|hd|4k|uhd|remastered)\b[^)\]]*[)\]]/gi,
    '',
  );
  for (const artist of artists) title = title.replace(new RegExp(`^\\s*${escape(artist)}\\s*[-–—:|]\\s*`, 'i'), '');
  title = title.replace(/\s*[-–—|]\s*(?:official\s+)?(?:music\s+)?video\s*$/i, '');
  return matchKey(title);
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

/** The newest music videos first (Home). */
export function newestVideos(videos: BaseItem[] | undefined, limit = 12): BaseItem[] {
  return [...(videos ?? [])].sort((a, b) => (b.DateCreated ?? '').localeCompare(a.DateCreated ?? '')).slice(0, limit);
}

/**
 * What to play after `current`: another video by the same artist you haven't watched yet,
 * else any other one you haven't, at random. null when there's nothing new.
 */
export function nextVideo(current: BaseItem, videos: BaseItem[] | undefined, watched: Set<string>): BaseItem | null {
  const fresh = (videos ?? []).filter((v) => v.Id !== current.Id && !watched.has(v.Id));
  if (!fresh.length) return null;
  const artists = new Set((current.Artists ?? []).map(matchKey));
  const same = fresh.filter((v) => (v.Artists ?? []).some((a) => artists.has(matchKey(a))));
  const pool = same.length ? same : fresh;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Music videos whose title or artist has every word of the search. */
export function searchVideos(term: string, videos: BaseItem[] | undefined, limit = 10): BaseItem[] {
  const words = matchKey(term).split(' ').filter(Boolean);
  if (!words.length || !videos?.length) return [];
  return videos
    .filter((v) => {
      const text = matchKey(`${v.Name} ${(v.Artists ?? []).join(' ')}`);
      return words.every((w) => text.includes(w));
    })
    .slice(0, limit);
}

/** Load the video list in the background (menus read it from the cache). */
export function prefetchMusicVideos() {
  const { client, session } = useAuth.getState();
  if (!client || !session || isOffline()) return;
  void queryClient.prefetchQuery({
    queryKey: ['musicVideos', session.userId, 'online'],
    queryFn: () => client.getMusicVideos(),
    staleTime: 30 * 60_000,
  });
}

/** The videos already loaded (for menus, which can't wait for a request). */
export function cachedMusicVideos(): BaseItem[] {
  const userId = useAuth.getState().session?.userId;
  return queryClient.getQueryData<BaseItem[]>(['musicVideos', userId, 'online']) ?? [];
}

export function newPlaySessionId(): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/** Play a music video, pausing the song. */
export async function playMusicVideo(video: BaseItem) {
  const client = useAuth.getState().client;
  if (!client) return;
  if (isOffline()) {
    showToast('Music videos need your server');
    return;
  }
  if (usePlayer.getState().playing) usePlayer.getState().toggle();
  if (inAppVideo) {
    useVideoSession.getState().play(video);
    router.push(`/video?id=${video.Id}` as never);
    return;
  }
  const session = newPlaySessionId();
  await WebBrowser.openBrowserAsync(client.videoStreamUrl(video, session), {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
  // Closed: the server can stop converting it.
  client.stopVideoEncoding(session).catch(() => {});
}
