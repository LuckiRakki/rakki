// The in-app music video player (expo-video). Loaded lazily from the video screen, and only on
// builds that have expo-video's native side.
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { newPlaySessionId } from '@/video/musicVideos';

export default function VideoPlayer({ video }: { video: BaseItem }) {
  const client = useAuth((s) => s.client);
  const { width } = useWindowDimensions();
  const session = useMemo(() => newPlaySessionId(), []);
  const uri = useMemo(() => client?.videoStreamUrl(video, session) ?? null, [client, video, session]);
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.play();
  });

  // Closing the screen ends the server's conversion of the video.
  useEffect(() => () => void client?.stopVideoEncoding(session).catch(() => {}), [client, session]);

  return (
    <VideoView
      player={player}
      style={{ width, height: Math.round((width * 9) / 16), backgroundColor: '#000' }}
      contentFit="contain"
      nativeControls
      // The app is portrait-only; full screen turns the video sideways.
      fullscreenOptions={{ enable: true, orientation: 'landscape' }}
      allowsPictureInPicture
    />
  );
}
