import { Stack } from 'expo-router';

import { useTheme } from '@/ui/theme';

// One stack per tab. Shared routes (album/[id]) exist in all three groups, so opening an
// album keeps you inside the tab you came from, like Spotify.
export const unstable_settings = {
  anchor: 'index',
  search: { anchor: 'search' },
  library: { anchor: 'library' },
};

export default function TabStackLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }} />
  );
}
