import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { artistLine } from '@/lib/items';
import { usePlayer, type QueueEntry } from '@/player/store';
import { Artwork } from '@/ui/Artwork';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

interface Row {
  entry: QueueEntry;
  index: number;
}

/** Spotify's queue: Now playing · Next in queue · Next from <source>. Drag-to-reorder: Phase 3. */
export default function QueueScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const source = usePlayer((s) => s.source);
  const playing = usePlayer((s) => s.playing);

  const current = queue[index];
  let end = index + 1;
  while (queue[end]?.origin === 'queued') end++;
  const rows = (from: number, to: number): Row[] =>
    queue.slice(from, to).map((entry, i) => ({ entry, index: from + i }));

  const sections = [
    { title: 'Now playing', data: current ? [{ entry: current, index }] : [] },
    { title: 'Next in queue', data: rows(index + 1, end) },
    { title: source ? `Next from: ${source.name}` : 'Next up', data: rows(end, queue.length) },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top > 20 ? t.space.md : t.space.lg }]}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Queue</T>
        <View style={{ width: 28 }} />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.entry.key}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xl }}
        renderSectionHeader={({ section }) => (
          <T variant="heading" style={styles.sectionTitle}>
            {section.title}
          </T>
        )}
        renderItem={({ item: { entry, index: i } }) => {
          const isCurrent = i === index;
          return (
            <Pressable
              onPress={() => (isCurrent ? usePlayer.getState().toggle() : usePlayer.getState().skipTo(i))}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.colors.surface }]}>
              <Artwork item={entry.item} size={46} />
              <View style={{ flex: 1, marginHorizontal: t.space.md }}>
                <T
                  variant="bodyStrong"
                  numberOfLines={1}
                  color={isCurrent ? t.colors.accent : t.colors.text}>
                  {entry.item.Name}
                </T>
                <T variant="caption" numberOfLines={1}>
                  {artistLine(entry.item)}
                </T>
              </View>
              {isCurrent ? (
                <Ionicons name={playing ? 'volume-high' : 'pause'} size={18} color={t.colors.accent} />
              ) : (
                <Pressable hitSlop={10} onPress={() => usePlayer.getState().removeAt(i)}>
                  <Ionicons name="remove-circle-outline" size={22} color={t.colors.textMuted} />
                </Pressable>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
            Your queue is empty.
          </T>
        }
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.lg,
    paddingBottom: t.space.sm,
  },
  sectionTitle: { paddingHorizontal: t.space.lg, paddingTop: t.space.xl, paddingBottom: t.space.sm, fontSize: t.size(17) },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, paddingVertical: t.space.sm },
}));
