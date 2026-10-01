import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { checkForUpdate } from '@/lib/updates';
import { startDownloads } from '@/downloads/manager';
import { ensureSearchIndex } from '@/search/index';
import { useModalTracker } from '@/ui/nav';
import { OverlayHost } from '@/ui/OverlayHost';
import { useTheme } from '@/ui/theme';
import { ThemeProvider as RakkiThemeProvider } from '@/ui/ThemeProvider';
import { ToastHost } from '@/ui/Toast';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const status = useAuth((s) => s.status);
  const signedIn = useAuth((s) => s.session !== null);

  useEffect(() => {
    void useAuth.getState().load();
    void checkForUpdate();
  }, []);

  const ready = fontsLoaded && status === 'ready';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <RakkiThemeProvider>
      <AppShell signedIn={signedIn} />
    </RakkiThemeProvider>
  );
}

/** Everything under the theme, so navigation colours follow the appearance settings too. */
function AppShell({ signedIn }: { signedIn: boolean }) {
  const t = useTheme();
  useModalTracker();

  // Downloads: load what's saved, finish anything unfinished, catch up playlists.
  const userId = useAuth((s) => s.session?.userId);
  useEffect(() => {
    if (userId) startDownloads(userId);
  }, [userId]);

  // Build or top up the fuzzy-search index once the first screens have loaded.
  useEffect(() => {
    if (!signedIn) return;
    const id = setTimeout(() => void ensureSearchIndex(), 8000);
    return () => clearTimeout(id);
  }, [signedIn]);
  const navTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: t.colors.bg,
      card: t.colors.bg,
      primary: t.colors.accent,
      text: t.colors.text,
      border: 'transparent',
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={navTheme}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="player" options={{ presentation: 'modal' }} />
              <Stack.Screen name="queue" options={{ presentation: 'modal' }} />
              <Stack.Screen name="lyrics" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
              <Stack.Screen name="downloads" options={{ presentation: 'modal' }} />
            </Stack.Protected>
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="login" />
            </Stack.Protected>
          </Stack>
          <OverlayHost />
          <ToastHost />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
