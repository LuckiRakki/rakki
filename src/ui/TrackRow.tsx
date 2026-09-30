import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { formatDuration, ticksToSeconds } from '@/lib/format';
import { artistLine } from '@/lib/items';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

export function TrackRow({
  track,
  active,
  playing,
  onPress,
  onLongPress,
}: {
  track: BaseItem;
  active: boolean;
  playing: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.space.lg,
        paddingVertical: 10,
        backgroundColor: pressed ? t.colors.surface : 'transparent',
      })}>
      <View style={{ width: 28, alignItems: 'flex-start' }}>
        {active ? (
          <Ionicons
            name={playing ? 'volume-high' : 'volume-mute'}
            size={16}
            color={t.colors.accent}
          />
        ) : (
          <T variant="caption" color={t.colors.textMuted}>
            {track.IndexNumber ?? ''}
          </T>
        )}
      </View>
      <View style={{ flex: 1, marginRight: t.space.md }}>
        <T variant="bodyStrong" numberOfLines={1} color={active ? t.colors.accent : t.colors.text}>
          {track.Name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {artistLine(track)}
        </T>
      </View>
      <T variant="caption" color={t.colors.textMuted}>
        {formatDuration(ticksToSeconds(track.RunTimeTicks))}
      </T>
    </Pressable>
  );
}
