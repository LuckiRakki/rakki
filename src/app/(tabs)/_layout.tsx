import { Ionicons } from '@/ui/Icon';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLibraryView } from '@/library/view';
import { MiniPlayer } from '@/player/MiniPlayer';
import { OfflineBar } from '@/ui/OfflineBar';
import { useDock } from '@/ui/dock';
import { Glass } from '@/ui/Glass';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  const TabIcon = ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? active : inactive} size={24} color={color} />
  );
  return TabIcon;
}

/**
 * Rakki 2.0's tab bar: a glass pill (Settings > Look > Glass) with the open tab lit, under the floating
 * mini player.
 */
function PillTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: Math.max(insets.bottom - 8, 8) }}>
      <Glass radius={32} style={{ flexDirection: 'row', padding: 4, gap: 4 }}>
        {state.routes.map((route, i) => {
          const { options } = descriptors[route.key];
          const focused = state.index === i;
          const color = focused ? t.colors.text : t.colors.textSecondary;
          const label = typeof options.title === 'string' ? options.title : route.name;
          const onPress = () => {
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={{
                flex: 1,
                height: t.appearance.tabLabels ? 54 : 46,
                borderRadius: 27,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                backgroundColor: focused ? 'rgba(255,255,255,0.12)' : 'transparent',
              }}>
              {options.tabBarIcon?.({ focused, color, size: 24 })}
              {t.appearance.tabLabels ? (
                <T style={{ fontFamily: focused ? t.fonts.bold : t.fonts.semibold, fontSize: t.size(11), color }}>{label}</T>
              ) : null}
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

export default function TabLayout() {
  const t = useTheme();
  return (
    <Tabs
      // Mini-player rides on top of the tab bar, like Spotify.
      tabBar={(props) => (
        // Floats over the pages (no band behind it): they scroll on underneath, and each list
        // ends with the dock's height of room (useDockSpace) so nothing stays hidden.
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
          onLayout={(e) => useDock.setState({ height: Math.round(e.nativeEvent.layout.height) })}>
          <OfflineBar />
          <MiniPlayer />
          <PillTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.text,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: { backgroundColor: t.colors.bg, borderTopWidth: 0, elevation: 0 },
        tabBarLabelStyle: { fontFamily: t.fonts.medium, fontSize: t.size(10) },
        tabBarShowLabel: t.appearance.tabLabels,
      }}>
      <Tabs.Screen
        name="(home)"
        options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="(search)"
        options={{ title: 'Search', tabBarIcon: tabIcon('search', 'search-outline') }}
      />
      <Tabs.Screen
        name="(library)"
        options={{ title: 'Your Library', tabBarIcon: tabIcon('library', 'library-outline') }}
        // Already in Library: tapping it again goes to the first of its tabs.
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (!navigation.isFocused()) return;
            const { tabOrder, setTab } = useLibraryView.getState();
            if (tabOrder[0]) setTab(tabOrder[0]);
          },
        })}
      />
    </Tabs>
  );
}
