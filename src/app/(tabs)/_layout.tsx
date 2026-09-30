import { Ionicons } from '@expo/vector-icons';
import { BottomTabBar, Tabs } from 'expo-router/tabs';
import { View, type ColorValue } from 'react-native';

import { MiniPlayer } from '@/player/MiniPlayer';
import { useTheme } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  const TabIcon = ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? active : inactive} size={24} color={color} />
  );
  return TabIcon;
}

export default function TabLayout() {
  const t = useTheme();
  return (
    <Tabs
      // Mini-player rides on top of the tab bar, like Spotify. Because the bar is in normal
      // layout flow, screens end above it and nothing is hidden behind the player.
      tabBar={(props) => (
        <View style={{ backgroundColor: t.colors.bg }}>
          <MiniPlayer />
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.text,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: { backgroundColor: t.colors.bg, borderTopWidth: 0, elevation: 0 },
        tabBarLabelStyle: { fontFamily: t.fonts.medium, fontSize: t.size(10) },
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
      />
    </Tabs>
  );
}
