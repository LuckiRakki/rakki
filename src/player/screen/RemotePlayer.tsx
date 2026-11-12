import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@/ui/Icon';
import { HeartButton } from '@/ui/HeartButton';
import { thud } from '@/lib/haptics';
import { useAuth } from '@/auth/store';
import { useInAnyPlaylist } from '@/library/playlistCache';
import { artColor } from '@/lib/blurhash';
import { artistLine } from '@/lib/items';
import { PlayButton } from '@/player/PlayButton';
import { SeekBar } from '@/player/SeekBar';
import { useRemoteProgress, useRemoteTarget } from '@/player/remoteTarget';
import { usePlayer } from '@/player/store';
import type { RakkiDevice } from '@/remote/devices';
import { Artwork } from '@/ui/Artwork';
import { ArtistLinks } from '@/ui/ArtistLinks';
import { Marquee } from '@/ui/Marquee';
import { Slider } from '@/ui/Slider';
import { openAlbum } from '@/ui/nav';
import { openAddToPlaylist, openMenu } from '@/ui/overlays';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { tap, usePlayerStyles } from '@/player/screen/styles';

/**
 * Another Rakki's song, like Spotify's Connect player: its cover, title and place, with buttons
 * that command it, its volume when it takes volume commands, and "Listening on {device}" at the
 * bottom (tap for Connect to move it back).
 */
export function RemotePlayer({ target }: { target: RakkiDevice }) {
  const t = useTheme();
  const styles = usePlayerStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const client = useAuth((s) => s.client);
  const { position, duration } = useRemoteProgress(250);
  const item = target.item;
  const itemId = item?.Id;
  const r = useRemoteTarget.getState;
  const art = Math.min(width - t.space.xl * 2, 420);
  const tint = artColor(item ? client?.blurhash(item) : undefined);
  // The server's session doesn't say whether you liked the song: ask for it.
  const full = useQuery({
    queryKey: ['remoteItem', itemId],
    queryFn: () => (client && itemId ? client.getItem(itemId) : Promise.reject(new Error('Nothing playing'))),
    enabled: !!client && !!itemId,
    staleTime: 60_000,
  }).data;
  const [liked, setLiked] = useState<{ id: string; v: boolean } | null>(null);
  const favorite = item ? (liked?.id === item.Id ? liked.v : (full?.UserData?.IsFavorite ?? item.UserData?.IsFavorite ?? false)) : false;
  const inPlaylist = useInAnyPlaylist(item?.Id);
  return (
    <View style={styles.root}>
      <LinearGradient colors={[t.tint(tint), '#101010']} locations={[0, 0.85]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: insets.top + t.space.sm, paddingBottom: insets.bottom + t.space.md, paddingHorizontal: t.space.xl }}>
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
            <Ionicons name="chevron-down" size={28} color={t.colors.text} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', marginHorizontal: t.space.md }}>
            <T variant="label" color={t.colors.textSecondary} style={{ fontSize: t.size(10) }}>
              Playing On
            </T>
            <T numberOfLines={1} style={{ fontFamily: t.fonts.bold, fontSize: t.size(13) }}>
              {target.name}
            </T>
          </View>
          {item ? (
            <Pressable hitSlop={12} onPress={() => openMenu(full ?? item)} accessibilityLabel="More">
              <Ionicons name="ellipsis-horizontal" size={24} color={t.colors.text} />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {item ? (
            <Artwork item={item} size={art} style={styles.artShadow} />
          ) : (
            <T variant="caption">Nothing playing on {target.name}</T>
          )}
        </View>

        {item ? (
          <>
            <View style={styles.titleRow}>
              <View style={{ flex: 1, marginRight: t.space.md }}>
                <Pressable disabled={!item.AlbumId} onPress={() => item.AlbumId && openAlbum(item.AlbumId)}>
                  <Marquee text={item.Name} style={styles.title} />
                </Pressable>
                <ArtistLinks artists={item.ArtistItems} fallback={artistLine(item)} variant="caption" numberOfLines={1} style={styles.artist} />
              </View>
              <HeartButton
                liked={favorite}
                inPlaylist={inPlaylist}
                onToggle={(v) => {
                  setLiked({ id: item.Id, v });
                  usePlayer.getState().setFavorite(item.Id, v);
                }}
                onLongPress={() => {
                  thud();
                  openAddToPlaylist([full ?? item], item.Name);
                }}
              />
            </View>
            <SeekBar position={position} duration={duration} onSeek={(s) => r().seek(s)} />
            <View style={[styles.controls, { justifyContent: 'center', gap: t.space.xxl }]}>
              <Pressable hitSlop={10} onPress={tap(() => r().command('PreviousTrack'))} accessibilityLabel="Previous">
                <Ionicons name="play-skip-back" size={34} color={t.colors.text} />
              </Pressable>
              <PlayButton playing={!target.paused} onPress={tap(() => r().command('PlayPause'))} />
              <Pressable hitSlop={10} onPress={tap(() => r().command('NextTrack'))} accessibilityLabel="Next">
                <Ionicons name="play-skip-forward" size={34} color={t.colors.text} />
              </Pressable>
            </View>
          </>
        ) : null}

        {target.commands.includes('SetVolume') ? (
          <View style={styles.volumeRow} accessibilityLabel={`${target.name}'s volume`}>
            <Ionicons name="volume-low" size={20} color={t.colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Slider value={target.volume ?? 80} min={0} max={100} step={1} onChange={(v) => r().volume(v)} />
            </View>
            <Ionicons name="volume-high" size={20} color={t.colors.textSecondary} />
          </View>
        ) : null}

        <Pressable onPress={() => router.push('/devices')} accessibilityRole="button" accessibilityLabel={`Listening on ${target.name}. Open Connect`} style={styles.listeningOn}>
          <Ionicons name="laptop-outline" size={18} color={t.colors.accentText} />
          <T numberOfLines={1} style={{ fontFamily: t.fonts.bold, fontSize: t.size(13), color: t.colors.accentText, flexShrink: 1 }}>
            Listening on {target.name}
          </T>
        </Pressable>
      </View>
    </View>
  );
}
