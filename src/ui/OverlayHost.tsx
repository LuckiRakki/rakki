import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AddToPlaylistPanel } from '@/ui/AddToPlaylist';
import { ContextMenuPanel } from '@/ui/ContextMenu';
import { useOverlays } from '@/ui/overlays';
import { CLOSE_MS } from '@/ui/Sheet';
import { TopLayer } from '@/ui/TopLayer';

/**
 * The single layer every sheet lives in (see TopLayer). Opening another sheet from a sheet
 * (menu → Add to playlist) just swaps panels inside it.
 */
export function OverlayHost() {
  const open = useOverlays((s) => !!s.menu || !!s.addTo);
  const [mounted, setMounted] = useState(open);
  const dim = useSharedValue(0);

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    dim.set(withTiming(open ? 0.6 : 0, { duration: open ? 220 : CLOSE_MS }));
    if (open || !mounted) return;
    // Everything closed: let the panels slide out, then unmount the layer.
    const id = setTimeout(() => setMounted(false), CLOSE_MS + 60);
    return () => clearTimeout(id);
  }, [open, mounted, dim]);

  const backdrop = useAnimatedStyle(() => ({ opacity: dim.get() }));

  if (!mounted) return null;
  return (
    <TopLayer onRequestClose={() => useOverlays.getState().closeAll()}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdrop]}>
          <Pressable style={{ flex: 1 }} onPress={() => useOverlays.getState().closeAll()} />
        </Animated.View>
        <ContextMenuPanel />
        <AddToPlaylistPanel />
      </GestureHandlerRootView>
    </TopLayer>
  );
}
