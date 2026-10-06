// Owns the music video player at the app's root, so the video keeps playing when its screen is
// swiped down (the mini-player shows it). Keeps the queue topped up and handles the end: with
// autoplay on, a 5-second "Up next" countdown while the video screen is open, or straight on to
// the next video otherwise. Starting a song stops the video. Loaded lazily, only on builds with
// expo-video's native side.
import { useEvent } from 'expo';
import { usePathname } from 'expo-router';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { useMusicVideos } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { useScreenAwake } from '@/lib/keepAwake';
import { reclaimAudioSession } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { useSettings } from '@/settings/store';
import { newPlaySessionId } from '@/video/musicVideos';
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

  // Settings → Playback → Play music videos in the background, switched while one plays.
  useEffect(
    () =>
      useSettings.subscribe((s, prev) => {
        const player = useVideoSession.getState().player as VideoPlayer | null;
        if (player && s.videoBackgroundAudio !== prev.videoBackgroundAudio) player.staysActiveInBackground = s.videoBackgroundAudio;
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
    p.keepScreenOnWhilePlaying = true;
    // The sound carries on with the app in the background or the phone locked (the picture
    // stops); the video picks up again when Rakki's back.
    p.staysActiveInBackground = useSettings.getState().videoBackgroundAudio;
    p.play();
  });
  const countdown = useVideoSession((s) => s.countdown);
  // The screen stays on while the video plays, wherever it's showing.
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  useScreenAwake('videoPlaying', isPlaying);
  const queueSize = useSettings((s) => s.videoQueueSize);

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

  // Top the queue up as soon as this one starts (and keep it to the size set in Settings).
  useEffect(() => {
    useVideoSession.getState().fill(videos, queueSize);
  }, [video, videos, queueSize]);

  // The end: count down on the open video screen, or go straight on while minimized (or in the
  // background, where a countdown would stall once the sound stops).
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      if (!useSettings.getState().videoAutoplay || !useVideoSession.getState().upNext.length) return;
      if (pathname === '/video' && AppState.currentState === 'active') useVideoSession.setState({ countdown: COUNTDOWN_S });
      else useVideoSession.getState().next();
    });
    return () => sub.remove();
  }, [player, pathname]);

  useEffect(() => {
    if (countdown === null) return;
    const id = setTimeout(() => {
      if (countdown > 1) useVideoSession.setState({ countdown: countdown - 1 });
      else useVideoSession.getState().next();
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  return null;
}
