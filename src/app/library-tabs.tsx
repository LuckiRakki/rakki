import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { runOnJS } from 'react-native-reanimated';
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { thud, tick } from '@/lib/haptics';
import { LIBRARY_TABS, useLibraryView, type LibraryTab } from '@/library/view';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** Put the Library's chips in your order (opened by holding a chip). Saved as you drag. */
export default function LibraryTabsScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const order = useLibraryView((s) => s.tabOrder);

  const onReorder = ({ from, to }: { from: number; to: number }) => {
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    useLibraryView.getState().setTabOrder(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top > 20 ? t.space.md : t.space.lg }]}>
        <View style={{ width: 56 }} />
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Library tabs</T>
        <Pressable hitSlop={10} onPress={() => router.back()} style={{ width: 56, alignItems: 'flex-end' }}>
          <T variant="bodyStrong" color={t.colors.accent}>
            Done
          </T>
        </Pressable>
      </View>
      <ReorderableList
        data={order}
        keyExtractor={(key) => key}
        onDragStart={() => {
          'worklet';
          runOnJS(thud)();
        }}
        onReorder={onReorder}
        contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xl }}
        ListHeaderComponent={
          <T variant="caption" style={{ paddingHorizontal: t.space.lg, paddingBottom: t.space.md }}>
            Drag a tab by its handle to move it. The Library shows them in this order.
          </T>
        }
        ListFooterComponent={
          <Pressable
            hitSlop={8}
            onPress={() => {
              tick();
              useLibraryView.getState().setTabOrder(null);
            }}
            style={{ alignSelf: 'center', marginTop: t.space.xl }}>
            <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(14), color: t.colors.textSecondary }}>
              Reset to the default order
            </T>
          </Pressable>
        }
        renderItem={({ item }) => <TabRow tab={item} />}
      />
    </View>
  );
}

const TabRow = memo(function TabRow({ tab }: { tab: LibraryTab }) {
  const t = useTheme();
  const styles = useStyles();
  const drag = useReorderableDrag();
  const label = LIBRARY_TABS.find((x) => x.key === tab)?.label ?? tab;
  return (
    <Pressable onLongPress={drag} delayLongPress={250} style={styles.row}>
      <T variant="bodyStrong" style={{ flex: 1 }}>
        {label}
      </T>
      <Pressable hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPressIn={drag} accessibilityLabel={`Move ${label}`}>
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
    paddingBottom: t.space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.space.lg,
    height: 56,
    backgroundColor: t.colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
}));
