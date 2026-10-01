import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { formatDuration, ticksToSeconds } from '@/lib/format';
import { artistLine } from '@/lib/items';
import { useTrackDownload } from '@/downloads/store';
import { Artwork } from '@/ui/Artwork';
import { useOffline } from '@/lib/online';
import { openMenu, showToast } from '@/ui/overlays';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/**
 * A song row. Album pages show the track number; playlists, Liked Songs and Popular show the
 * album art (`art`) or a rank (`rank`). Long-press opens the song menu.
 */
export function TrackRow({
  track,
  active,
  playing,
  onPress,
  onLongPress,
  art = false,
  rank,
}: {
  track: BaseItem;
  active: boolean;
  playing: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  art?: boolean;
  rank?: number;
}) {
  const t = useTheme();
  const downloaded = useTrackDownload(track.Id);
  // Offline, songs that aren't on the phone are greyed out and can't be played.
  const unavailable = useOffline() && downloaded !== 'done';
  const indicator = (
    <Ionicons name={playing ? 'volume-high' : 'volume-mute'} size={16} color={t.colors.accent} />
  );
  return (
    <Pressable
      onPress={unavailable ? () => showToast('Not downloaded, so it can’t play offline') : onPress}
      onLongPress={onLongPress ?? (() => openMenu(track))}
      delayLongPress={350}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.space.lg,
        paddingVertical: art ? t.space.sm : 10,
        backgroundColor: pressed ? t.colors.surface : 'transparent',
        opacity: unavailable ? 0.4 : 1,
      })}>
      {rank !== undefined ? (
        <View style={{ width: 24, alignItems: 'flex-start' }}>
          {active ? (
            indicator
          ) : (
            <T variant="caption" color={t.colors.textSecondary}>
              {rank}
            </T>
          )}
        </View>
      ) : null}
      {art ? (
        <Artwork item={track} size={48} style={{ marginRight: t.space.md }} />
      ) : rank === undefined ? (
        <View style={{ width: 28, alignItems: 'flex-start' }}>
          {active ? (
            indicator
          ) : (
            <T variant="caption" color={t.colors.textMuted}>
              {track.IndexNumber ?? ''}
            </T>
          )}
        </View>
      ) : null}
      <View style={{ flex: 1, marginRight: t.space.md }}>
        <T variant="bodyStrong" numberOfLines={1} color={active ? t.colors.accent : t.colors.text}>
          {track.Name}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {downloaded === 'done' ? (
            <Ionicons name="arrow-down-circle" size={13} color={t.colors.accent} style={{ marginRight: 4 }} />
          ) : null}
          <T variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
            {artistLine(track)}
          </T>
        </View>
      </View>
      {track.UserData?.IsFavorite ? (
        <Ionicons name="heart" size={14} color={t.colors.accent} style={{ marginRight: t.space.sm }} />
      ) : null}
      <T variant="caption" color={t.colors.textMuted}>
        {formatDuration(ticksToSeconds(track.RunTimeTicks))}
      </T>
    </Pressable>
  );
}
