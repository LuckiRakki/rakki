import { LinearGradient } from 'expo-linear-gradient';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { queryClient, useRecentlyAdded, useRecentlyPlayed } from '@/api/queries';
import { router } from 'expo-router';
import { useAuth } from '@/auth/store';
import { greeting } from '@/lib/format';
import { AlbumTile, QuickTile } from '@/ui/AlbumTile';
import { T } from '@/ui/T';
import { colors, fonts, space } from '@/ui/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const userName = useAuth((s) => s.session?.userName ?? '');
  const recent = useRecentlyPlayed();
  const added = useRecentlyAdded();

  const quick = recent.data?.slice(0, 6) ?? [];
  const jumpBackIn = recent.data?.slice(6) ?? [];
  const refreshing = recent.isRefetching || added.isRefetching;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.text}
          onRefresh={() => void queryClient.invalidateQueries()}
        />
      }>
      <LinearGradient
        colors={['rgba(255,107,61,0.22)', colors.bg]}
        style={[StyleSheet.absoluteFill, { height: 320 }]}
        pointerEvents="none"
      />
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/settings')} style={styles.avatar} hitSlop={8}>
          <T style={{ fontFamily: fonts.bold, fontSize: 15, color: '#000' }}>
            {userName.charAt(0).toUpperCase() || '?'}
          </T>
        </Pressable>
        <T variant="display">{greeting()}</T>
      </View>

      {quick.length > 0 ? (
        <View style={styles.grid}>
          {chunk(quick, 2).map((pair, i) => (
            <View key={i} style={styles.gridRow}>
              {pair.map((a) => (
                <QuickTile key={a.Id} album={a} />
              ))}
              {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      <Shelf title="Jump back in" items={jumpBackIn} error={recent.error} />
      <Shelf title="Recently added" items={added.data ?? []} error={added.error} />
    </ScrollView>
  );
}

function Shelf({ title, items, error }: { title: string; items: BaseItem[]; error: Error | null }) {
  if (error) {
    return (
      <View style={styles.shelf}>
        <T variant="heading" style={styles.shelfTitle}>
          {title}
        </T>
        <T variant="caption" style={{ paddingHorizontal: space.lg }}>
          Couldn’t load: {error.message}
        </T>
      </View>
    );
  }
  if (items.length === 0) return null;
  return (
    <View style={styles.shelf}>
      <T variant="heading" style={styles.shelfTitle}>
        {title}
      </T>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(a) => a.Id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg }}
        renderItem={({ item }) => <AlbumTile album={item} size={148} />}
      />
    </View>
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    marginBottom: space.lg,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { paddingHorizontal: space.lg, gap: space.sm },
  gridRow: { flexDirection: 'row', gap: space.sm },
  shelf: { marginTop: space.xl },
  shelfTitle: { paddingHorizontal: space.lg, marginBottom: space.md },
});
