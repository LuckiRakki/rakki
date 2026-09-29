import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/ui/T';
import { colors, radius, space } from '@/ui/theme';

// Placeholder: live search with filter chips and genre tiles arrives in Phase 3.
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.md }}>
      <T variant="display" style={{ paddingHorizontal: space.lg, marginBottom: space.lg }}>
        Search
      </T>
      <View
        style={{
          marginHorizontal: space.lg,
          height: 46,
          borderRadius: radius.card,
          backgroundColor: colors.text,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: space.md,
          gap: space.sm,
          opacity: 0.9,
        }}>
        <Ionicons name="search" size={22} color="#000" />
        <T style={{ color: '#555', fontSize: 15 }}>What do you want to listen to?</T>
      </View>
      <T variant="caption" style={{ padding: space.lg, textAlign: 'center' }}>
        Search is coming in Phase 3.
      </T>
    </View>
  );
}
