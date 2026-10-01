import { FlatList, View } from 'react-native';

import { useStations } from '@/radio/stations';
import { StationTile } from '@/radio/StationViews';
import { openLibrary } from '@/ui/nav';
import { SectionTitle } from '@/ui/Shelf';
import { useTheme } from '@/ui/theme';

/** Home's Radio row: your stations, with what's on air. Nothing until a station is added. */
export function RadioShelf() {
  const t = useTheme();
  const stations = useStations((s) => s.stations);
  if (!stations.length) return null;
  return (
    <View style={{ marginTop: t.space.xl }}>
      <SectionTitle title="Radio" onShowAll={() => openLibrary('radio')} />
      <FlatList
        horizontal
        data={stations}
        keyExtractor={(s) => s.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: t.space.lg, gap: t.space.lg }}
        renderItem={({ item }) => <StationTile station={item} />}
      />
    </View>
  );
}
