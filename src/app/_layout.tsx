import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { queryClient } from '@/api/queries';
import { FONT_FILES } from '@/appearance/fonts';
import { useAuth } from '@/auth/store';
import { watchServer } from '@/lib/online';
import { checkForUpdate } from '@/lib/updates';
import { startDownloads } from '@/downloads/manager';
import { sendKeptListens } from '@/player/offlineListens';
import { restoreQueue } from '@/player/store';
import { ensureSearchIndex } from '@/search/index';
import { loadRecentSearches } from '@/search/recent';
import { openPlayer, takePendingLink, useModalTracker } from '@/ui/nav';
import { OverlayHost } from '@/ui/OverlayHost';
import { useTheme } from '@/ui/theme';
import { ThemeProvider as RakkiThemeProvider } from '@/ui/ThemeProvider';
import { ToastHost } from '@/ui/Toast';
import { startWidgets } from '@/widgets';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONT_FILES);
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

  // Watch whether the server answers (offline mode switches on its own when it doesn't).
  const serverUrl = useAuth((s) => s.session?.serverUrl ?? null);
  useEffect(() => {
    watchServer(serverUrl);
  }, [serverUrl]);

  // Downloads: load what's saved, finish anything unfinished, catch up playlists.
  const userId = useAuth((s) => s.session?.userId);
  useEffect(() => {
    if (!userId) return;
    startDownloads(userId);
    loadRecentSearches(userId);
    // After downloads load, so a restored queue plays downloaded songs from the phone.
    restoreQueue(userId);
    // Listens from the last time Rakki was offline.
    void sendKeptListens();
    // Opened from the Now Playing widget while closed: the player, now that there's a queue.
    if (takePendingLink() === '/player') setTimeout(openPlayer, 0);
  }, [userId]);

  // Home Screen / Lock Screen widgets follow the player and recently played from here on.
  useEffect(() => {
    startWidgets();
  }, []);

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
              <Stack.Screen name="customize" options={{ presentation: 'modal' }} />
              <Stack.Screen name="lyrics-style" options={{ presentation: 'modal' }} />
              <Stack.Screen name="add-account" options={{ presentation: 'modal' }} />
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
