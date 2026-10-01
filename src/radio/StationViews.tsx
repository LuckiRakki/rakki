import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Alert, Pressable, View } from 'react-native';

import { usePlayer } from '@/player/store';
import { useStationOnAir } from '@/radio/live';
import { useStations, type Station } from '@/radio/stations';
import type { OnAir } from '@/radio/subwave';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/** What's on, in one line: "Song · Artist", or the show, or nothing yet. */
function onAirLine(info: OnAir | undefined): string | null {
  if (!info) return null;
  if (info.title) return [info.title, info.artist].filter(Boolean).join(' · ');
  return info.show ?? null;
}

/** The song on air's cover, or a radio tile until there is one. */
export function StationArt({ station, size, info }: { station: Station; size: number; info?: OnAir }) {
  const t = useTheme();
  const box = { width: size, height: size, borderRadius: t.radius.art };
  if (info?.coverUrl) return <Image source={{ uri: info.coverUrl }} style={box} contentFit="cover" transition={200} />;
  return (
    <View style={[box, { backgroundColor: t.colors.surface2, alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name="radio" size={size * 0.42} color={t.colors.accent} accessibilityLabel={station.name} />
    </View>
  );
}

function LiveBadge() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.colors.accent }} />
      <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(11), color: t.colors.accent }}>LIVE</T>
    </View>
  );
}

const useIsPlaying = (station: Station) =>
  usePlayer((s) => s.queue[s.index]?.item.Radio?.stationId === station.id && s.playing);

/** Long press: remove the station (after asking). */
export function confirmRemoveStation(station: Station) {
  Alert.alert(`Remove ${station.name}?`, 'You can add it again any time with its address.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => useStations.getState().remove(station.id) },
  ]);
}

/** A station in Library → Radio. */
export function StationRow({ station }: { station: Station }) {
  const t = useTheme();
  const info = useStationOnAir(station);
  const live = useIsPlaying(station);
  const line = onAirLine(info);
  return (
    <Pressable
      onPress={() => usePlayer.getState().playStation(station)}
      onLongPress={() => confirmRemoveStation(station)}
      delayLongPress={350}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.sm,
        backgroundColor: pressed ? t.colors.surface : 'transparent',
      })}>
      <StationArt station={station} size={56} info={info} />
      <View style={{ flex: 1, marginLeft: t.space.md }}>
        <T variant="bodyStrong" numberOfLines={1} color={live ? t.colors.accent : t.colors.text}>
          {station.name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {line ?? (station.apiBase ? 'SUB/WAVE station' : 'Internet radio')}
        </T>
        {info?.show ? (
          <T variant="caption" numberOfLines={1} style={{ fontSize: t.size(12), color: t.colors.textMuted }}>
            {info.dj ? `${info.show} with ${info.dj}` : info.show}
          </T>
        ) : null}
      </View>
      {live ? <LiveBadge /> : <Ionicons name="play-circle-outline" size={28} color={t.colors.textSecondary} />}
    </Pressable>
  );
}

/** A station on Home's Radio row. */
export function StationTile({ station, size = 148 }: { station: Station; size?: number }) {
  const t = useTheme();
  const info = useStationOnAir(station);
  const live = useIsPlaying(station);
  return (
    <Pressable
      onPress={() => usePlayer.getState().playStation(station)}
      onLongPress={() => confirmRemoveStation(station)}
      delayLongPress={350}
      style={({ pressed }) => ({ width: size, opacity: pressed ? 0.8 : 1 })}>
      <StationArt station={station} size={size} info={info} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <T variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1, fontSize: t.size(14) }}>
          {station.name}
        </T>
        {live ? <LiveBadge /> : null}
      </View>
      <T variant="caption" numberOfLines={1}>
        {onAirLine(info) ?? 'Radio'}
      </T>
    </Pressable>
  );
}
