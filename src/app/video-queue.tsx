import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { runOnJS } from 'react-native-reanimated';
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { thud, tick } from '@/lib/haptics';
import { useSettings } from '@/settings/store';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { videoTitle } from '@/video/musicVideos';
import { useVideoSession } from '@/video/session';

/**
 * The music video queue, like the song one: what you've watched (folded away), what's on, and
 * everything up next. Tap one to play it; drag by the handle (or long-press) to reorder.
 */
export default function VideoQueueScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const video = useVideoSession((s) => s.video);
  const history = useVideoSession((s) => s.history);
  const upNext = useVideoSession((s) => s.upNext);
  const autoplay = useSettings((s) => s.videoAutoplay);
  const [showWatched, setShowWatched] = useState(false);

  const onReorder = ({ from, to }: { from: number; to: number }) =>
    useVideoSession.getState().setUpNext(reorderItems(useVideoSession.getState().upNext, from, to));

  const top = video ? (
    <View>
      {history.length ? (
        <View>
          <Pressable
            onPress={() => setShowWatched(!showWatched)}
            accessibilityState={{ expanded: showWatched }}
            style={({ pressed }) => [styles.watchedToggle, pressed && { opacity: 0.7 }]}>
            <T variant="heading" style={{ fontSize: t.size(17), flex: 1 }}>
              Watched
            </T>
            <T variant="caption" style={{ marginRight: t.space.xs }}>
              {showWatched ? 'Hide' : `Show ${history.length} ${history.length === 1 ? 'video' : 'videos'}`}
            </T>
            <Ionicons name={showWatched ? 'chevron-up' : 'chevron-down'} size={18} color={t.colors.textSecondary} />
          </Pressable>
          {showWatched
            ? history.map((item, i) => (
                <Pressable
                  key={`${item.Id}:${i}`}
                  onPress={() => {
                    tick();
                    useVideoSession.getState().backTo(i);
                  }}
                  style={({ pressed }) => [styles.row, { opacity: 0.6 }, pressed && { backgroundColor: t.colors.surface }]}>
                  <VideoInfo item={item} />
                </Pressable>
              ))
            : null}
        </View>
      ) : null}
      <T variant="heading" style={styles.sectionTitle}>
        Now playing
      </T>
      <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.colors.surface }]}>
        <VideoInfo item={video} current />
      </Pressable>
      <T variant="heading" style={styles.sectionTitle}>
        Up next
      </T>
      {!autoplay && upNext.length ? (
        <T variant="caption" style={{ paddingHorizontal: t.space.lg, marginTop: -t.space.xs, marginBottom: t.space.sm }}>
          Autoplay is off, so videos stop at the end (Settings → Playback).
        </T>
      ) : null}
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top > 20 ? t.space.md : t.space.lg }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Video queue</T>
        <View style={{ width: 28 }} />
      </View>
      <ReorderableList
        data={upNext}
        keyExtractor={(v) => v.Id}
        onDragStart={() => {
          'worklet';
          runOnJS(thud)();
        }}
        onReorder={onReorder}
        ListHeaderComponent={top}
        contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xl }}
        renderItem={({ item }) => <QueueRow item={item} />}
        ListEmptyComponent={
          <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
            {video ? 'Nothing else to play.' : 'No video playing.'}
          </T>
        }
      />
    </View>
  );
}

function VideoInfo({ item, current }: { item: BaseItem; current?: boolean }) {
  const t = useTheme();
  const styles = useStyles();
  const client = useAuth((s) => s.client);
  const thumb = client?.videoThumbUrl(item, 240);
  return (
    <>
      <View style={styles.thumb}>{thumb ? <Image source={{ uri: thumb }} style={{ flex: 1 }} contentFit="cover" /> : null}</View>
      <View style={{ flex: 1, marginHorizontal: t.space.md }}>
        <T variant="bodyStrong" numberOfLines={1} color={current ? t.colors.accent : undefined}>
          {videoTitle(item.Name, item.Artists ?? []) || item.Name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {[item.Artists?.join(', '), item.ProductionYear].filter(Boolean).join(' · ')}
        </T>
      </View>
    </>
  );
}

const QueueRow = memo(function QueueRow({ item }: { item: BaseItem }) {
  const t = useTheme();
  const styles = useStyles();
  const drag = useReorderableDrag();
  // Look the position up at tap time: the queue may have changed since this row rendered.
  const at = () => useVideoSession.getState().upNext.findIndex((v) => v.Id === item.Id);
  return (
    <Pressable
      onPress={() => {
        tick();
        useVideoSession.getState().skipTo(at());
      }}
      onLongPress={drag}
      delayLongPress={300}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.colors.surface : t.colors.bg }]}>
      <VideoInfo item={item} />
      <Pressable
        hitSlop={10}
        accessibilityLabel={`Remove ${item.Name} from the queue`}
        onPress={() => useVideoSession.getState().remove(at())}>
        <Ionicons name="remove-circle-outline" size={22} color={t.colors.textMuted} />
      </Pressable>
      <Pressable
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
        onPressIn={drag}
        accessibilityLabel={`Reorder ${item.Name}`}
        style={{ marginLeft: t.space.md }}>
        <Ionicons name="reorder-three" size={26} color={t.colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
});

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.lg,
    paddingBottom: t.space.sm,
  },
  sectionTitle: {
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.xl,
    paddingBottom: t.space.sm,
    fontSize: t.size(17),
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, paddingVertical: t.space.sm },
  thumb: { width: 80, height: 45, borderRadius: 6, overflow: 'hidden', backgroundColor: t.colors.surface2 },
  watchedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.lg,
    paddingBottom: t.space.xs,
  },
}));
