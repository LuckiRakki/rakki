import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { localArtUri } from '@/downloads/store';
import { artColor } from '@/lib/blurhash';
import { useTheme } from '@/ui/theme';
import { FlowingCover } from '@/spicy/Backdrop';
import { KAWARP_DIM } from '@/spicy/Kawarp';
import { useInBackground } from '@/lib/appActive';
import { FadeColor, SONG_FADE_MS } from '@/ui/FadeColor';

/** Behind the player: Kawarp (the cover flowing like liquid), a colour gradient or the blurred cover (Customize), and
 *  with Clear glass a dark fade under the controls. */
export function PlayerBackdrop({ track }: { track: BaseItem }) {
  const t = useTheme();
  const away = useInBackground();
  const client = useAuth((s) => s.client);
  const tint = artColor(client?.blurhash(track));
  const playerBackground = t.appearance.playerBackground;
  // Blurred anyway, so a small cover does (the moving one's even smaller: three copies move).
  const artUri =
    playerBackground === 'blur' || playerBackground === 'moving'
      ? (localArtUri(track.AlbumId ?? track.Id) ?? client?.imageUrl(track, playerBackground === 'moving' ? 300 : 600))
      : undefined;
  return (
    <>
      {playerBackground === 'moving' ? (
        // The cover's colours flowing slowly behind everything (still with reduced motion).
        <FadeColor color={t.tint(tint)} style={{ overflow: 'hidden' }} pointerEvents="none">
          <FlowingCover uri={artUri} motion={t.reduceMotion ? 0 : t.appearance.playerMotion} fade={SONG_FADE_MS} />
          {away ? null : (
            <>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: KAWARP_DIM }]} />
              <LinearGradient
                colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.6)']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
            </>
          )}
        </FadeColor>
      ) : playerBackground === 'gradient' ? (
        // The colour eases under a fixed fade to near-black (same as a gradient from the colour).
        <FadeColor color={t.tint(tint)} pointerEvents="none">
          <LinearGradient colors={['rgba(16,16,16,0)', '#101010']} locations={[0, 0.85]} style={StyleSheet.absoluteFill} />
        </FadeColor>
      ) : playerBackground === 'blur' && !away ? (
        <View style={StyleSheet.absoluteFill}>
          <Image
            source={artUri ? { uri: artUri } : undefined}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={60}
            cachePolicy="memory-disk"
            transition={SONG_FADE_MS}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        </View>
      ) : null}
      {t.glass.kind === 'clear' ? (
        // Clear glass has no panel: a dark fade under the controls keeps them readable.
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.52)', 'rgba(0,0,0,0.62)']}
          locations={[0, 0.46, 1]}
          style={[StyleSheet.absoluteFill, { top: '45%' }]}
        />
      ) : null}
    </>
  );
}
