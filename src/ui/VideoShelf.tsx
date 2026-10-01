import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { FlatList, Pressable, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { SectionTitle } from '@/ui/Shelf';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { playMusicVideo } from '@/video/musicVideos';

const WIDTH = 240;
const HEIGHT = Math.round((WIDTH * 9) / 16);

/** A row of music videos (16:9 thumbnails). Renders nothing when there are none. */
export function VideoShelf({ title, videos }: { title: string; videos: BaseItem[] }) {
  const t = useTheme();
  const client = useAuth((s) => s.client);
  if (!videos.length) return null;
  return (
    <View style={{ marginTop: t.space.xl }}>
      <SectionTitle title={title} />
      <FlatList
        horizontal
        data={videos}
        keyExtractor={(v) => v.Id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: t.space.lg, gap: t.space.lg }}
        renderItem={({ item }) => {
          const thumb = client?.videoThumbUrl(item, WIDTH * 2);
          return (
            <Pressable
              onPress={() => void playMusicVideo(item)}
              accessibilityLabel={`Play the video ${item.Name}`}
              style={({ pressed }) => ({ width: WIDTH, opacity: pressed ? 0.8 : 1 })}>
              <View style={{ width: WIDTH, height: HEIGHT, borderRadius: t.radius.art, overflow: 'hidden', backgroundColor: t.colors.surface2 }}>
                {thumb ? <Image source={{ uri: thumb }} style={{ width: WIDTH, height: HEIGHT }} contentFit="cover" transition={150} /> : null}
                <View style={styleBadge}>
                  <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
                </View>
              </View>
              <T variant="bodyStrong" numberOfLines={1} style={{ marginTop: 8, fontSize: t.size(14) }}>
                {item.Name}
              </T>
              <T variant="caption" numberOfLines={1}>
                {['Music video', item.ProductionYear].filter(Boolean).join(' · ')}
              </T>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styleBadge = {
  position: 'absolute',
  left: 8,
  bottom: 8,
  width: 34,
  height: 34,
  borderRadius: 17,
  backgroundColor: 'rgba(0,0,0,0.55)',
  alignItems: 'center',
  justifyContent: 'center',
} as const;
