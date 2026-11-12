import { router } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';

import { Ionicons } from '@/ui/Icon';
import { matchesSearch } from '@/api/queries';
import { useStations } from '@/radio/stations';
import { StationRow } from '@/radio/StationViews';
import { T } from '@/ui/T';
import { useDockSpace } from '@/ui/dock';
import { useTheme } from '@/ui/theme';
import type { ListProps } from '@/library/tabs/shared';

/** Your radio stations, with Add a station at the top. */
export function Radio({ header, sort, filter }: ListProps) {
  const t = useTheme();
  const dock = useDockSpace();
  const stations = useStations((s) => s.stations).filter((st) => matchesSearch({ Name: st.name }, filter));
  const list =
    sort.key === 'alpha'
      ? [...stations].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      : sort.key === 'played'
        ? [...stations].sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) || b.addedAt - a.addedAt)
        : [...stations].sort((a, b) => b.addedAt - a.addedAt);
  return (
    <FlatList
      windowSize={7}
      data={list}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ paddingBottom: t.space.xl + dock }}
      ListHeaderComponent={
        <>
          {header}
          <Pressable
            onPress={() => router.push('/add-station')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: t.space.lg,
              paddingVertical: t.space.sm,
              backgroundColor: pressed ? t.colors.surface : 'transparent',
            })}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: t.radius.art,
                backgroundColor: t.colors.surface2,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="add" size={28} color={t.colors.text} />
            </View>
            <View style={{ flex: 1, marginLeft: t.space.md }}>
              <T variant="bodyStrong">Add a station</T>
              <T variant="caption">A SUB/WAVE station or any internet radio</T>
            </View>
          </Pressable>
        </>
      }
      renderItem={({ item }) => <StationRow station={item} />}
    />
  );
}
