// What's behind every screen when the theme has a backdrop (Settings → Look → Theme): Kawarp's
// playing cover flowing like liquid (@backdrop flow), or the cover blurred and still (@backdrop
// album), as on the desktop. Each screen draws its own copy, so a screen sliding in covers the one
// under it; one clock moves every copy, so they all show the same flow.
import { Image } from 'expo-image';
import { useEffect, type ReactElement } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { makeMutable, useAnimatedReaction, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { useAuth } from '@/auth/store';
import { localArtUri } from '@/downloads/store';
import { useBackgroundNow, useInBackground } from '@/lib/appActive';
import { artColor } from '@/lib/blurhash';
import { usePlayer } from '@/player/store';
import { Kawarp, KAWARP_DIM } from '@/spicy/Kawarp';
import { FadeColor, SONG_FADE_MS } from '@/ui/FadeColor';
import { useTheme } from '@/ui/theme';

/** Seconds of flow so far, shared by every copy. Moved by useBackdropClock at the root. */
const flowClock = makeMutable(0);
const sinceMove = makeMutable(0);

/** As on the Now Playing screen: the motion is slow, so 12 moves a second look the same as 60. */
const MOVES_PER_SECOND = 12;

/**
 * Moves Kawarp's flow. Mount once (the root layout). It moves only while a song plays and Rakki is
 * on screen, at Look → Now Playing → Movement's speed (still with reduced motion), like the desktop's,
 * which holds still while paused, hidden or in the tray.
 */
export function useBackdropClock() {
  const t = useTheme();
  const playing = usePlayer((s) => s.playing);
  const away = useBackgroundNow();
  const motion = t.reduceMotion ? 0 : t.appearance.playerMotion;
  useFrameCallback(
    (frame) => {
      'worklet';
      const since = sinceMove.get() + (frame.timeSincePreviousFrame ?? 0);
      if (since < 1000 / MOVES_PER_SECOND) {
        sinceMove.set(since);
        return;
      }
      sinceMove.set(0);
      flowClock.set((flowClock.get() + (since / 1000) * motion) % 36000);
    },
    t.backdrop === 'flow' && playing && !away && motion > 0,
  );
}

/**
 * The backdrop, filling what holds it. `anchor` is the window edge that holder sits on: 'top' for a
 * screen, 'bottom' for the tab bar, so the tab bar shows the bottom of the same picture as the
 * screen above it. Nothing when the theme has no backdrop.
 */
export function AppBackdrop({ anchor = 'top' }: { anchor?: 'top' | 'bottom' }) {
  const t = useTheme();
  const { height } = useWindowDimensions();
  const away = useInBackground();
  const client = useAuth((s) => s.client);
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const kind = t.backdrop;
  if (kind === 'none') return null;
  const uri = track ? (localArtUri(track.AlbumId ?? track.Id) ?? client?.imageUrl(track, kind === 'flow' ? 300 : 600)) : undefined;
  const base = track ? t.tint(artColor(client?.blurhash(track))) : t.colors.bg;
  return (
    <FadeColor color={base} pointerEvents="none" style={{ overflow: 'hidden' }}>
      {/* In the background only the colour stays: the covers and the blur keep big buffers. */}
      {uri && !away ? (
        <View style={{ position: 'absolute', left: 0, right: 0, height, [anchor]: 0 }}>
          {kind === 'flow' ? (
            <ScreenFlow uri={uri} />
          ) : (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={60} cachePolicy="memory-disk" transition={SONG_FADE_MS} />
          )}
        </View>
      ) : null}
      {kind === 'flow' && uri && !away ? <View style={[StyleSheet.absoluteFill, { backgroundColor: KAWARP_DIM }]} /> : null}
      {/* Dims bright covers so white text reads on any of them. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: kind === 'flow' ? 'rgba(0,0,0,0.24)' : 'rgba(0,0,0,0.45)' }]} />
    </FadeColor>
  );
}

/** Screens that draw their own background (the player, lyrics, video) or hold a stack of screens (the tabs). */
const OWN_BACKGROUND = new Set(['(tabs)', 'player', 'lyrics', 'video']);

/** A stack's screenLayout: each screen over its own copy of the backdrop (nothing without one). */
export function backdropScreenLayout({ route, children }: { route: { name: string }; children: ReactElement }) {
  if (OWN_BACKGROUND.has(route.name)) return children;
  return (
    <View style={styles.screen}>
      <AppBackdrop />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });

/**
 * The flow for one copy. It follows the shared clock only while its screen is the one showing, so
 * the copies on screens underneath (and in other tabs) don't redraw; back on top, it catches up.
 */
function ScreenFlow({ uri }: { uri: string }) {
  const clock = useSharedValue(flowClock.get());
  const showing = useSharedValue(false);
  const focused = useIsFocused();
  useEffect(() => {
    showing.set(focused);
    if (focused) clock.set(flowClock.get());
  }, [clock, showing, focused]);
  useAnimatedReaction(
    () => flowClock.get(),
    (now) => {
      if (showing.get()) clock.set(now);
    },
  );
  return <Kawarp uri={uri} clock={clock} fade={SONG_FADE_MS} />;
}
