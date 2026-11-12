import { useMemo } from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';

import { AwayImage as Image } from '@/ui/AwayImage';
import type { BaseItem } from '@/api/jellyfin';
import { matchesSearch, useMusicVideos } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { playMusicVideo } from '@/video/musicVideos';
import { seededShuffle, useLibraryView } from '@/library/view';
import { T } from '@/ui/T';
import { useDockSpace } from '@/ui/dock';
import { useTheme } from '@/ui/theme';
import { barWidth, Bone, FadeRow, GridSkeleton, Hold, Line } from '@/ui/Reveal';
import { type ListProps, useListReveal } from '@/library/tabs/shared';

/** Your music videos: 16:9 tiles two across, or a list. Tap one to watch it. */
export function Videos({ header, sort, layout, filter }: ListProps) {
  const t = useTheme();
  const dock = useDockSpace();
  const client = useAuth((s) => s.client);
  const videos = useMusicVideos();
  const seed = useLibraryView((s) => s.shuffleSeed);
  const { width } = useWindowDimensions();
  const grid = layout === 'grid';
  const gap = t.space.lg;
  const tileW = Math.floor((width - t.space.lg * 2 - gap) / 2);
  const list = useMemo(() => {
    const all = (videos.data ?? []).filter((v) => matchesSearch(v, filter));
    if (sort.key === 'alpha') return [...all].sort((a, b) => a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' }));
    if (sort.key === 'random') return seededShuffle(all, seed);
    return [...all].sort((a, b) => (b.DateCreated ?? '').localeCompare(a.DateCreated ?? ''));
  }, [videos.data, sort.key, seed, filter]);
  const { step, fade } = useListReveal(videos);

  const thumb = (video: BaseItem, w: number) => {
    const uri = client?.videoThumbUrl(video, w * 2);
    return (
      <View style={{ width: w, height: Math.round((w * 9) / 16), borderRadius: t.radius.art, overflow: 'hidden', backgroundColor: t.colors.surface2 }}>
        {uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" transition={150} /> : null}
      </View>
    );
  };

  return (
    <FlatList
      windowSize={7}
      key={grid ? 'grid' : 'list'}
      data={list}
      numColumns={grid ? 2 : 1}
      keyExtractor={(v) => v.Id}
      columnWrapperStyle={grid ? { gap, paddingHorizontal: t.space.lg } : undefined}
      contentContainerStyle={{ paddingBottom: t.space.xl + dock, gap: grid ? t.space.lg : 0 }}
      ListHeaderComponent={header}
      ListEmptyComponent={
        step.show === 'placeholder' ? (
          <Hold step={step}>
            {grid ? (
              <GridSkeleton tile={tileW} height={Math.round((tileW * 9) / 16)} columns={2} gap={gap} rowGap={t.space.lg} rows={5} />
            ) : (
              <VideoRowsSkeleton />
            )}
          </Hold>
        ) : videos.isLoading ? null : (
          <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
            No music videos yet. Add a Music Videos library in Jellyfin and they show up here.
          </T>
        )
      }
      renderItem={({ item, index }) =>
        grid ? (
          <FadeRow entering={fade(index)}>
            <Pressable onPress={() => void playMusicVideo(item)} style={({ pressed }) => ({ width: tileW, opacity: pressed ? 0.8 : 1 })}>
              {thumb(item, tileW)}
              <T variant="bodyStrong" numberOfLines={1} style={{ marginTop: 6, fontSize: t.size(14) }}>
                {item.Name}
              </T>
              <T variant="caption" numberOfLines={1}>
                {[item.Artists?.join(', '), item.ProductionYear].filter(Boolean).join(' · ')}
              </T>
            </Pressable>
          </FadeRow>
        ) : (
          <FadeRow entering={fade(index)}>
            <Pressable
              onPress={() => void playMusicVideo(item)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: t.space.lg,
                paddingVertical: t.space.sm,
                backgroundColor: pressed ? t.colors.surface : 'transparent',
              })}>
              {thumb(item, 112)}
              <View style={{ flex: 1, marginLeft: t.space.md }}>
                <T variant="bodyStrong" numberOfLines={2}>
                  {item.Name}
                </T>
                <T variant="caption" numberOfLines={1}>
                  {[item.Artists?.join(', '), item.ProductionYear].filter(Boolean).join(' · ')}
                </T>
              </View>
            </Pressable>
          </FadeRow>
        )
      }
    />
  );
}

/** Music video rows still loading: a wide picture, the title and the artist. */
function VideoRowsSkeleton() {
  const t = useTheme();
  return (
    <View pointerEvents="none">
      {Array.from({ length: 8 }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, paddingVertical: t.space.sm }}>
          <Bone style={{ width: 112, height: 63, borderRadius: t.radius.art }} />
          <View style={{ flex: 1, marginLeft: t.space.md }}>
            <Line variant="bodyStrong" width={barWidth(i, 6)} />
            <Line variant="caption" width={barWidth(i + 3, 30)} />
          </View>
        </View>
      ))}
    </View>
  );
}
