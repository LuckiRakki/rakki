import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { artistLine } from '@/lib/items';
import { queueRows, reorderedUpcoming } from '@/player/queueRows';
import { usePlayer, type QueueEntry } from '@/player/store';
import { Artwork } from '@/ui/Artwork';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/**
 * Spotify's queue: Now playing · Next in queue · Next from <source>. Drag a song by its handle
 * (or long-press the row) to reorder; see queueRows.ts for how drops move songs between
 * sections.
 */
export default function QueueScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const source = usePlayer((s) => s.source);
  const playing = usePlayer((s) => s.playing);

  const current = queue[index];
  const rows = queueRows(queue.slice(index + 1), source ? `Next from: ${source.name}` : 'Next up');
  const onReorder = ({ from, to }: { from: number; to: number }) =>
    usePlayer.getState().setUpcoming(reorderedUpcoming(rows, from, to));

  const nowPlaying = current ? (
    <View>
      <T variant="heading" style={styles.sectionTitle}>
        Now playing
      </T>
      <Pressable
        onPress={() => usePlayer.getState().toggle()}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.colors.surface }]}>
        <Artwork item={current.item} size={46} />
        <View style={{ flex: 1, marginHorizontal: t.space.md }}>
          <T variant="bodyStrong" numberOfLines={1} color={t.colors.accent}>
            {current.item.Name}
          </T>
          <T variant="caption" numberOfLines={1}>
            {artistLine(current.item)}
          </T>
        </View>
        <Ionicons name={playing ? 'volume-high' : 'pause'} size={18} color={t.colors.accent} />
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top > 20 ? t.space.md : t.space.lg }]}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Queue</T>
        <View style={{ width: 28 }} />
      </View>
      <ReorderableList
        data={rows}
        keyExtractor={(r) => r.key}
        onReorder={onReorder}
        ListHeaderComponent={nowPlaying}
        contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xl }}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <T variant="heading" style={styles.sectionTitle}>
              {item.title}
            </T>
          ) : (
            <QueueRow entry={item.entry} />
          )
        }
        ListEmptyComponent={
          current ? null : (
            <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
              Your queue is empty.
            </T>
          )
        }
      />
    </View>
  );
}

const QueueRow = memo(function QueueRow({ entry }: { entry: QueueEntry }) {
  const t = useTheme();
  const styles = useStyles();
  const drag = useReorderableDrag();
  // Look the position up at tap time: the queue may have changed since this row rendered.
  const at = () => usePlayer.getState().queue.findIndex((e) => e.key === entry.key);
  return (
    <Pressable
      onPress={() => usePlayer.getState().skipTo(at())}
      onLongPress={drag}
      delayLongPress={300}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.colors.surface : t.colors.bg }]}>
      <Artwork item={entry.item} size={46} />
      <View style={{ flex: 1, marginHorizontal: t.space.md }}>
        <T variant="bodyStrong" numberOfLines={1}>
          {entry.item.Name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {artistLine(entry.item)}
        </T>
      </View>
      <Pressable
        hitSlop={10}
        accessibilityLabel={`Remove ${entry.item.Name} from the queue`}
        onPress={() => usePlayer.getState().removeAt(at())}>
        <Ionicons name="remove-circle-outline" size={22} color={t.colors.textMuted} />
      </Pressable>
      <Pressable
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
        onPressIn={drag}
        accessibilityLabel={`Reorder ${entry.item.Name}`}
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
    backgroundColor: t.colors.bg,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, paddingVertical: t.space.sm },
}));
