// Owns the music video player at the app's root, so the video keeps playing when its screen is
// swiped down (the mini-player shows it). Handles what happens at the end: with autoplay on, a
// 5-second "Up next" countdown while the video screen is open, or straight to the next video
// while it's minimized. Starting a song stops the video. Loaded lazily, only on builds with
// expo-video's native side.
import { usePathname } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import { useEffect, useMemo } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { useMusicVideos } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { reclaimAudioSession } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { useSettings } from '@/settings/store';
import { nextVideo, newPlaySessionId } from '@/video/musicVideos';
import { useVideoSession } from '@/video/session';

export const COUNTDOWN_S = 5;

export default function VideoHost() {
  const video = useVideoSession((s) => s.video);

  // Playing a song ends the video.
  useEffect(
    () =>
      usePlayer.subscribe((s, prev) => {
        if (s.playing && !prev.playing && useVideoSession.getState().video) useVideoSession.getState().stop();
      }),
    [],
  );

  return video ? <Host key={video.Id} video={video} /> : null;
}

function Host({ video }: { video: BaseItem }) {
  const client = useAuth((s) => s.client);
  const videos = useMusicVideos().data;
  const pathname = usePathname();
  const session = useMemo(() => newPlaySessionId(), []);
  const uri = useMemo(() => client?.videoStreamUrl(video, session) ?? null, [client, video, session]);
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.play();
  });
  const countdown = useVideoSession((s) => s.countdown);
  const next = useVideoSession((s) => s.next);

  // Share the player; when this video ends (or is replaced), give the audio session back and
  // let the server stop converting it.
  useEffect(() => {
    useVideoSession.setState({ player });
    return () => {
      if (useVideoSession.getState().player === player) useVideoSession.setState({ player: null });
      void client?.stopVideoEncoding(session).catch(() => {});
      setTimeout(reclaimAudioSession, 800);
    };
  }, [player, client, session]);

  // What comes next, picked as soon as this one starts.
  useEffect(() => {
    useVideoSession.setState({ next: nextVideo(video, videos, new Set(useVideoSession.getState().watched)) });
  }, [video, videos]);

  // The end: count down on the open video screen, or go straight on while minimized.
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      const { next: upNext } = useVideoSession.getState();
      if (!useSettings.getState().videoAutoplay || !upNext) return;
      if (pathname === '/video') useVideoSession.setState({ countdown: COUNTDOWN_S });
      else useVideoSession.getState().play(upNext);
    });
    return () => sub.remove();
  }, [player, pathname]);

  useEffect(() => {
    if (countdown === null) return;
    const id = setTimeout(() => {
      if (countdown > 1) useVideoSession.setState({ countdown: countdown - 1 });
      else if (next) useVideoSession.getState().play(next);
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown, next]);

  return null;
}
