import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { withAlpha } from '@/lib/color';
import { useTheme } from '@/ui/theme';

/** The Liked Songs tile: a heart on an accent gradient, like Spotify's. */
export function LikedArt({ size }: { size: number }) {
  const t = useTheme();
  return (
    <LinearGradient
      colors={[t.colors.accent, withAlpha(t.colors.accent, 0.45)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: t.radius.art, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="heart" size={size * 0.42} color="#fff" />
    </LinearGradient>
  );
}
