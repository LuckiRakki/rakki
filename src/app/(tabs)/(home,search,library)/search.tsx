import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

// Placeholder: live search with filter chips and genre tiles arrives in Phase 3.
export default function SearchScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top + t.space.md }}>
      <T variant="display" style={{ paddingHorizontal: t.space.lg, marginBottom: t.space.lg }}>
        Search
      </T>
      <View
        style={{
          marginHorizontal: t.space.lg,
          height: 46,
          borderRadius: t.radius.card,
          backgroundColor: t.colors.text,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: t.space.md,
          gap: t.space.sm,
          opacity: 0.9,
        }}>
        <Ionicons name="search" size={22} color="#000" />
        <T style={{ color: '#555', fontSize: t.size(15) }}>What do you want to listen to?</T>
      </View>
      <T variant="caption" style={{ padding: t.space.lg, textAlign: 'center' }}>
        Search is coming in Phase 3.
      </T>
    </View>
  );
}
