import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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
import { inAppVideo, prefetchMusicVideos } from '@/video/musicVideos';
import { resetScreenAwake } from '@/lib/keepAwake';
import { OpeningFade } from '@/ui/Rise';
import { watchRadio } from '@/radio/live';
import { startWidgets } from '@/widgets';
import { logErrorNow, startPerfLog } from '@/perf/log';
import { startMemoryCare } from '@/lib/memory';
import { startPlaylistCache } from '@/library/playlistCache';

SplashScreen.preventAutoHideAsync();

// The music video player lives here, above the screens, so it keeps playing when the video
// screen is swiped down (expo-video builds only).
const VideoHost = inAppVideo ? lazy(() => import('@/video/VideoHost')) : null;

/**
 * Something threw while drawing: say so (with the error, and a way to try again) instead of
 * closing the app, and send the error to the server's log (Settings → Performance log). Plain
 * styles: the theme may be what broke.
 */
function CrashScreen({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: '#0b0b0b', paddingHorizontal: 24, paddingTop: 96 }}>
      <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>Something went wrong</Text>
      <Text style={{ color: '#aaa', fontSize: 15, marginTop: 8 }}>
        Rakki hit an error drawing this screen. It has been sent to your server&apos;s log.
      </Text>
      <ScrollView style={{ marginTop: 20, maxHeight: 240, backgroundColor: '#181818', borderRadius: 12, padding: 14 }}>
        <Text selectable style={{ color: '#ddd', fontSize: 13, fontFamily: 'Menlo' }}>
          {error.message}
        </Text>
      </ScrollView>
      <Pressable
        onPress={retry}
        style={({ pressed }) => ({
          marginTop: 24,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        })}>
        <Text style={{ color: '#000', fontSize: 16, fontWeight: '700' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

/** Around the whole app: any screen, the tab bar, the mini-player. */
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    void logErrorNow(error.message, error.stack);
  }

  render() {
    const { error } = this.state;
    if (error) return <CrashScreen error={error} retry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

/** expo-router's own boundary for routes (errors inside a screen). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    void logErrorNow(error.message, error.stack);
  }, [error]);
  return <CrashScreen error={error} retry={() => void retry()} />;
}

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
    <AppErrorBoundary>
      <RakkiThemeProvider>
        <AppShell signedIn={signedIn} />
      </RakkiThemeProvider>
    </AppErrorBoundary>
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
    prefetchMusicVideos();
    // Which songs each playlist has, on the phone (Add to playlist's ticks), kept in step.
    startPlaylistCache();
    // Opened from the Now Playing widget while closed: the player, now that there's a queue.
    if (takePendingLink() === '/player') setTimeout(openPlayer, 0);
  }, [userId]);

  // Home Screen / Lock Screen widgets follow the player and recently played from here on;
  // a radio station's now-playing is followed while it plays.
  useEffect(() => {
    startWidgets();
    watchRadio();
    // How the app uses the phone, for battery drain (Settings → Performance log).
    startPerfLog();
    // Memory back to iOS in the background, so it doesn't close Rakki to get it.
    startMemoryCare();
    // The screen sleeps as usual except on lyrics and music videos (lib/keepAwake.ts).
    resetScreenAwake();
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
          <OpeningFade>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
              <Stack.Protected guard={signedIn}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="player" options={{ presentation: 'modal' }} />
                <Stack.Screen name="queue" options={{ presentation: 'modal' }} />
                <Stack.Screen name="lyrics" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
                <Stack.Screen
                  name="video"
                  // Over the app (not instead of it), so swiping the video down shows the app behind.
                  options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }}
                />
                <Stack.Screen name="video-queue" options={{ presentation: 'modal' }} />
                <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
                <Stack.Screen name="downloads" options={{ presentation: 'modal' }} />
                <Stack.Screen name="customize" options={{ presentation: 'modal' }} />
                <Stack.Screen name="lyrics-style" options={{ presentation: 'modal' }} />
                <Stack.Screen name="add-account" options={{ presentation: 'modal' }} />
                <Stack.Screen name="add-station" options={{ presentation: 'modal' }} />
                <Stack.Screen name="edit-station" options={{ presentation: 'modal' }} />
                <Stack.Screen name="library-tabs" options={{ presentation: 'modal' }} />
              </Stack.Protected>
              <Stack.Protected guard={!signedIn}>
                <Stack.Screen name="login" />
              </Stack.Protected>
            </Stack>
          </OpeningFade>
          {VideoHost && signedIn ? (
            <Suspense fallback={null}>
              <VideoHost />
            </Suspense>
          ) : null}
          <OverlayHost />
          <ToastHost />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
