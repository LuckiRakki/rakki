import { router } from 'expo-router';
import { Pressable, Share, View } from 'react-native';

import { Ionicons } from '@/ui/Icon';
import { getRoutePicker } from '../../../modules/rakki-audio';
import type { BaseItem } from '@/api/jellyfin';
import { useMusicVideos } from '@/api/queries';
import { artistLine } from '@/lib/items';
import { sleepSheet, useSleepLabel } from '@/player/sleep';
import { openOptions } from '@/ui/overlays';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { findVideoFor, playMusicVideo } from '@/video/musicVideos';
import { usePlayerStyles } from '@/player/screen/styles';

const RoutePicker = getRoutePicker();

async function shareTrack(track: BaseItem) {
  const by = artistLine(track);
  try {
    await Share.share({ message: by ? `${track.Name} by ${by}` : track.Name });
  } catch {
    // Dismissed or unavailable: nothing to do.
  }
}

/** The player's last row: the device chip (Connect) on the left; sleep timer, music video,
 *  lyrics, AirPlay, share and queue on the right. */
export function PlayerActions({ track, radio, plainRadio }: { track: BaseItem; radio: boolean; plainRadio: boolean }) {
  const t = useTheme();
  const styles = usePlayerStyles();
  const sleepLabel = useSleepLabel();
  const videos = useMusicVideos();
  const video = videos.data ? findVideoFor(track, videos.data) : undefined;
  return (
    <View style={styles.bottomRow}>
      <Pressable onPress={() => router.push('/devices')} accessibilityLabel="Playing on This iPhone. Change Device" style={styles.deviceChip}>
        <Ionicons name="phone-portrait-outline" size={16} color={t.colors.text} />
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(13) }}>This iPhone</T>
      </Pressable>
      <View style={styles.side}>
        {sleepLabel ? (
          <Pressable hitSlop={8} accessibilityLabel={`Sleep Timer: ${sleepLabel}`} onPress={() => openOptions(sleepSheet(true))} style={styles.sleepPill}>
            <Ionicons name="moon" size={13} color={t.colors.accentText} />
            <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(12), color: t.colors.accentText }}>{sleepLabel}</T>
          </Pressable>
        ) : null}
        {video ? (
          <Pressable hitSlop={8} onPress={() => void playMusicVideo(video)} accessibilityLabel="Watch the Music Video" style={styles.iconBtn}>
            <Ionicons name="film-outline" size={22} color={t.colors.textSecondary} />
          </Pressable>
        ) : null}
        {plainRadio || t.appearance.lyricsCard ? null : (
          <Pressable hitSlop={8} onPress={() => router.push('/lyrics')} accessibilityLabel="Lyrics" style={styles.iconBtn}>
            <Ionicons name="mic-outline" size={22} color={t.colors.textSecondary} />
          </Pressable>
        )}
        {RoutePicker ? (
          <RoutePicker style={{ width: 36, height: 36 }} tintColor={t.colors.textSecondary} activeTintColor={t.colors.accentText} />
        ) : null}
        <Pressable hitSlop={8} onPress={() => void shareTrack(track)} accessibilityLabel="Share" style={styles.iconBtn}>
          <Ionicons name="share-outline" size={22} color={t.colors.textSecondary} />
        </Pressable>
        {radio ? null : (
          <Pressable hitSlop={8} onPress={() => router.push('/queue')} accessibilityLabel="Queue" style={styles.iconBtn}>
            <Ionicons name="list" size={24} color={t.colors.textSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
