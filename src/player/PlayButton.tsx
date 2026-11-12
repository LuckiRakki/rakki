import { ActivityIndicator, Pressable } from 'react-native';

import { Ionicons } from '@/ui/Icon';
import { useTheme } from '@/ui/theme';

/**
 * The big play / pause button: the accent circle by default (Maneki), or a plain white icon
 * (Settings > Look > Pause Button). `live` shows stop instead of pause (radio).
 */
export function PlayButton({ playing, buffering, live, onPress, size = 76 }: { playing: boolean; buffering?: boolean; live?: boolean; onPress: () => void; size?: number }) {
  const t = useTheme();
  const circle = t.appearance.pauseStyle === 'circle';
  const ink = circle ? t.colors.onAccent : t.colors.text;
  const icon = playing ? (live ? 'stop' : 'pause') : 'play';
  const glyph = Math.round(size * 0.5);
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={playing ? (live ? 'Stop' : 'Pause') : 'Play'}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: circle ? t.colors.accent : 'transparent' }}>
      {buffering ? (
        <ActivityIndicator color={ink} />
      ) : (
        <Ionicons name={icon} size={glyph} color={ink} style={{ marginLeft: playing ? 0 : Math.round(size / 18) }} />
      )}
    </Pressable>
  );
}
