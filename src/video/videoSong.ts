// The song a music video is of, for the video screen's album and artist links: found by the
// video's title (without "(Official Music Video)" and the like) and its artist.
import { useQuery } from '@tanstack/react-query';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { findVideoFor, videoTitle } from '@/video/musicVideos';

export function useVideoSong(video: BaseItem | null | undefined) {
  const client = useAuth((s) => s.client);
  // Plain values for the request (see useArtistPictures: no `video!.Name` in closures).
  const title = video ? videoTitle(video.Name, video.Artists ?? []) : '';
  return useQuery({
    queryKey: ['videoSong', client?.session.userId, video?.Id],
    enabled: !!client && !!video,
    staleTime: 6 * 60 * 60_000,
    queryFn: async () => {
      if (!title || !client || !video) return null;
      const { songs } = await client.search(title, 25, ['songs']);
      return songs.find((s) => findVideoFor(s, [video])) ?? null;
    },
  });
}
