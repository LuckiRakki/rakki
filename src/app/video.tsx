import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMusicVideos } from '@/api/queries';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { inAppVideo } from '@/video/musicVideos';

// expo-video loads its native side when imported, so only builds that have it import it.
const VideoPlayer = inAppVideo ? lazy(() => import('@/video/VideoPlayer')) : null;

/** A music video, full screen (the player's controls also go full screen in landscape). */
export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const video = useMusicVideos().data?.find((v) => v.Id === id);

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
            <VideoPlayer video={video} />
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
      </View>
    </View>
  );
}
