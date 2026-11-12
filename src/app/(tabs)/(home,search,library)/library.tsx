import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@/ui/Icon';
import { withAlpha } from '@/lib/color';
import { thud } from '@/lib/haptics';
import { useOffline } from '@/lib/online';
import { createPlaylist } from '@/library/actions';
import { layoutFor, LIBRARY_TABS, SORTS, sortFor, useLibraryView, type LibraryTab } from '@/library/view';
import { useSettled } from '@/search/useSearch';
import { Chip } from '@/ui/ItemRow';
import { openOptions } from '@/ui/overlays';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import type { ListProps } from '@/library/tabs/shared';
import { Albums } from '@/library/tabs/Albums';
import { Artists } from '@/library/tabs/Artists';
import { Videos } from '@/library/tabs/Videos';
import { Radio } from '@/library/tabs/Radio';
import { Genres } from '@/library/tabs/Genres';
import { Mixes } from '@/library/tabs/Mixes';
import { Playlists } from '@/library/tabs/Playlists';
import { Downloaded } from '@/library/tabs/Downloaded';
import { Songs } from '@/library/tabs/Songs';

/** Each tab's list. */
const LISTS: Record<LibraryTab, (props: ListProps) => ReactElement> = {
  albums: Albums,
  songs: Songs,
  artists: Artists,
  genres: Genres,
  radio: Radio,
  videos: Videos,
  playlists: Playlists,
  mixes: Mixes,
  downloads: Downloaded,
};

export default function LibraryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tab = useLibraryView((s) => s.tab);
  const tabOrder = useLibraryView((s) => s.tabOrder);
  const sort = useLibraryView((s) => sortFor(s, s.tab));
  const layout = useLibraryView((s) => layoutFor(s, s.tab));
  const offline = useOffline();
  // Search this tab: what's typed, and (a moment later) what's searched for.
  // The text belongs to the tab it was typed on: another tab (however it's reached) starts empty.
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState({ tab, text: '' });
  const text = typed.tab === tab ? typed.text : '';
  const setText = (value: string) => setTyped({ tab, text: value });
  const settled = useSettled(text.trim(), 250);
  // Cleared (or a fresh tab): everything at once, without waiting for the pause.
  const filter = text.trim() ? settled : '';
  const closeSearch = () => {
    setSearching(false);
    setText('');
  };

  // Each tab's list draws its own copy of this header, so switching tabs makes a new tab row:
  // put it back where it was scrolled to instead of at the first tab.
  const tabRow = useRef<ScrollView>(null);
  const tabRowX = useRef(0);
  const restoreTabRow = () => tabRow.current?.scrollTo({ x: tabRowX.current, animated: false });

  const chooseSort = () =>
    openOptions({
      title: 'Sort by',
      options: SORTS[tab].map(({ key, label }) => ({ key, label })),
      selected: sort.key,
      onSelect: (key) => useLibraryView.getState().setSort(tab, key),
    });

  const header = (
    <View style={{ paddingTop: insets.top + t.space.md, paddingBottom: t.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg }}>
        <T variant="display" style={{ flex: 1 }}>
          Your Library
        </T>
        {/* 2.0: History and Stats. */}
        {offline ? null : (
          <Pressable hitSlop={10} accessibilityLabel="History and Stats" onPress={() => router.push('/stats')} style={{ marginRight: t.space.lg }}>
            <Ionicons name="stats-chart-outline" size={24} color={t.colors.text} />
          </Pressable>
        )}
        {offline ? null : (
          <Pressable hitSlop={10} accessibilityLabel="Create playlist" onPress={() => void createPlaylist()}>
            <Ionicons name="add" size={30} color={t.colors.text} />
          </Pressable>
        )}
      </View>
      <ScrollView
        ref={tabRow}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => {
          tabRowX.current = e.nativeEvent.contentOffset.x;
        }}
        onContentSizeChange={restoreTabRow}
        style={{ marginTop: t.space.md, flexGrow: 0 }}
        contentContainerStyle={{ gap: t.space.sm, paddingHorizontal: t.space.lg }}>
        {tabOrder.map((key) => (
          <Chip
            key={key}
            label={LIBRARY_TABS.find((x) => x.key === key)?.label ?? key}
            active={tab === key}
            onPress={() => useLibraryView.getState().setTab(key)}
            onLongPress={() => {
              thud();
              router.push('/library-tabs');
            }}
          />
        ))}
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: t.space.lg,
          marginTop: t.space.lg,
        }}>
        {searching ? (
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space.sm,
              height: 36,
              paddingHorizontal: t.space.md,
              borderRadius: t.radius.card,
              backgroundColor: t.colors.surface3,
            }}>
            <Ionicons name="search" size={16} color={t.colors.textMuted} />
            <TextInput
              autoFocus
              value={text}
              onChangeText={setText}
              placeholder={`Search ${(LIBRARY_TABS.find((x) => x.key === tab)?.label ?? '').toLowerCase()}`}
              placeholderTextColor={t.colors.textMuted}
              autoCorrect={false}
              returnKeyType="search"
              style={{ flex: 1, color: t.colors.text, fontFamily: t.fonts.medium, fontSize: t.size(14) }}
            />
            {text ? (
              <Pressable hitSlop={8} onPress={() => setText('')} accessibilityLabel="Clear">
                <Ionicons name="close-circle" size={18} color={t.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.lg }}>
            <Pressable hitSlop={10} onPress={() => setSearching(true)} accessibilityLabel="Search this list">
              <Ionicons name="search" size={18} color={t.colors.text} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={chooseSort}
              accessibilityLabel={`Sort by ${sort.label}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.xs }}>
              <Ionicons name="swap-vertical" size={16} color={t.colors.text} />
              <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(13) }}>{sort.label}</T>
            </Pressable>
          </View>
        )}
        {searching ? (
          <Pressable hitSlop={10} onPress={closeSearch} style={{ marginLeft: t.space.md }} accessibilityLabel="Close search">
            <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(14) }}>Cancel</T>
          </Pressable>
        ) : tab === 'songs' || tab === 'radio' ? null : (
          <Pressable
            hitSlop={10}
            onPress={() => useLibraryView.getState().toggleLayout(tab)}
            accessibilityLabel={layout === 'grid' ? 'Show as list' : 'Show as grid'}>
            <Ionicons name={layout === 'grid' ? 'list' : 'grid-outline'} size={20} color={t.colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );

  const List = LISTS[tab];
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {/* 2.0: a soft album-colour wash behind the header (the lists scroll over it). */}
      <LinearGradient
        colors={[withAlpha(t.colors.accent, 0.2), withAlpha(t.colors.accent, 0)]}
        style={[StyleSheet.absoluteFill, { height: 260 }]}
        pointerEvents="none"
      />
      <List header={header} sort={sort} layout={layout} filter={filter} />
    </View>
  );
}
