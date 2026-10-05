import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { useMusicVideos } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { useScreenAwake } from '@/lib/keepAwake';
import { reclaimAudioSession } from '@/player/engine';
import { useSettings } from '@/settings/store';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { inAppVideo, nextVideo } from '@/video/musicVideos';

// expo-video loads its native side when imported, so only builds that have it import it.
const VideoPlayer = inAppVideo ? lazy(() => import('@/video/VideoPlayer')) : null;

const COUNTDOWN_S = 5;

/**
 * A music video with Rakki's own player. When it ends, another one by the same artist (or
 * anything else not watched yet) follows after a short countdown, unless Settings → Autoplay
 * music videos is off.
 */
export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const client = useAuth((s) => s.client);
  const videos = useMusicVideos().data;
  const autoplay = useSettings((s) => s.videoAutoplay);
  const [currentId, setCurrentId] = useState(id);
  const video = videos?.find((v) => v.Id === currentId);
  const watched = useRef(new Set<string>());
  const [next, setNext] = useState<BaseItem | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  useScreenAwake('video');
  // expo-video leaves the audio session set up for movies, mixed with other audio, which hides
  // Rakki's lock screen controls; take it back once its player has let go.
  useEffect(() => () => void setTimeout(reclaimAudioSession, 800), []);

  // Pick what comes next as soon as a video starts, so it can be shown below.
  useEffect(() => {
    if (!video) return;
    watched.current.add(video.Id);
    setNext(nextVideo(video, videos, watched.current));
    setCountdown(null);
  }, [video, videos]);

  // The countdown at the end, then the next video.
  useEffect(() => {
    if (countdown === null) return;
    const id = setTimeout(() => {
      if (countdown > 1) setCountdown(countdown - 1);
      else if (next) setCurrentId(next.Id);
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown, next]);

  const onEnded = () => {
    if (autoplay && next) setCountdown(COUNTDOWN_S);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, height: 48 }}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {VideoPlayer && video ? (
          <Suspense fallback={<ActivityIndicator color={t.colors.text} />}>
            <VideoPlayer key={video.Id} video={video} onEnded={onEnded} />
          </Suspense>
        ) : (
          <ActivityIndicator color={t.colors.text} />
        )}
        {video ? (
          <View style={{ paddingHorizontal: t.space.xl, marginTop: t.space.xl }}>
            <T numberOfLines={2} style={{ fontFamily: t.fonts.bold, fontSize: t.size(22) }}>
              {video.Name}
            </T>
            <T variant="caption" numberOfLines={1} style={{ fontSize: t.size(16), marginTop: 2 }}>
              {[video.Artists?.join(', '), video.ProductionYear].filter(Boolean).join(' · ')}
            </T>
          </View>
        ) : null}

        {autoplay && next ? (
          <View style={[styles.next, countdown !== null && { borderColor: t.colors.accent }]}>
            <View style={styles.thumb}>
              {client?.videoThumbUrl(next, 240) ? (
                <Image source={{ uri: client.videoThumbUrl(next, 240) }} style={{ flex: 1 }} contentFit="cover" />
              ) : null}
            </View>
            <View style={{ flex: 1, marginHorizontal: t.space.md }}>
              <T variant="label" color={countdown !== null ? t.colors.accent : t.colors.textSecondary} style={{ fontSize: t.size(10) }}>
                {countdown !== null ? `Up next in ${countdown}` : 'Up next'}
              </T>
              <T variant="bodyStrong" numberOfLines={1}>
                {next.Name}
              </T>
              <T variant="caption" numberOfLines={1}>
                {next.Artists?.join(', ') ?? ''}
              </T>
            </View>
            {countdown !== null ? (
              <Pressable hitSlop={10} onPress={() => setCountdown(null)} accessibilityLabel="Cancel autoplay">
                <Ionicons name="close" size={24} color={t.colors.textSecondary} />
              </Pressable>
            ) : null}
            <Pressable hitSlop={10} onPress={() => setCurrentId(next.Id)} accessibilityLabel="Play it now" style={{ marginLeft: t.space.md }}>
              <Ionicons name="play-skip-forward" size={24} color={t.colors.text} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: t.space.lg,
    marginTop: t.space.xl,
    padding: t.space.sm,
    borderRadius: t.radius.card,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  thumb: { width: 96, height: 54, borderRadius: 6, overflow: 'hidden', backgroundColor: t.colors.surface2 },
}));
