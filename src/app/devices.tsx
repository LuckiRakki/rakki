import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/store';
import { withAlpha } from '@/lib/color';
import { useRemoteTarget } from '@/player/remoteTarget';
import { usePlayer } from '@/player/store';
import { moveHere, tapDevice } from '@/remote/connect';
import { otherRakkiDevices, type RakkiDevice } from '@/remote/devices';
import { deviceIcon, nowLine } from '@/ui/DeviceSheet';
import { openDeviceSheet } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const REFRESH_MS = 3000;

/**
 * Connect, like Spotify's (and the desktop's): this phone and your other Rakki apps on this
 * server (docs/REMOTE_PLAYBACK.md), the one playing lit. Tap a device to listen there: the
 * music moves over at the same moment in the song, and this phone becomes its remote (the player
 * shows that device's song and controls it, player/remoteTarget.ts). With nothing playing here,
 * tapping a device that plays just controls it. Tap This Phone to bring the music back. Hold a
 * device to pick instead (ui/DeviceSheet.tsx): play this phone's song there, remote control it,
 * or play its song here. The screen closes at once; a toast says when it's playing (or why not).
 */
export default function DevicesScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const client = useAuth((s) => s.client);
  const [devices, setDevices] = useState<RakkiDevice[] | null>(null);
  const [error, setError] = useState(false);
  const [help, setHelp] = useState(false);
  const here = usePlayer((s) => s.queue[s.index]?.item);
  const playingHere = usePlayer((s) => s.playing);
  const target = useRemoteTarget((s) => s.target);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    const load = () =>
      otherRakkiDevices(client)
        .then((d) => alive && (setDevices(d), setError(false)))
        .catch(() => alive && setError(true));
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [client]);

  // Where the music is: this phone while it plays (or has nothing elsewhere to defer to), else
  // the device that's playing.
  // The device this phone controls counts as where the music is, even while it's paused there.
  const playingElsewhere = (target && devices?.find((d) => d.sessionId === target.sessionId)) || devices?.find((d) => d.item && !d.paused && d.controllable);
  const litHere = !target && (playingHere || !playingElsewhere);

  const pickHere = () => {
    if (!client || litHere) return;
    if (playingElsewhere?.item) void moveHere(client, playingElsewhere);
    else {
      useRemoteTarget.getState().setTarget(null);
      router.back();
    }
  };
  const pick = (d: RakkiDevice) => {
    if (client) tapDevice(client, d);
  };

  // A device that can't be controlled is dimmed, but holding it still offers playing its song here.
  const row = (key: string, icon: keyof typeof Ionicons.glyphMap, name: string, sub: string, lit: boolean, onPress: () => void, disabled = false, onHold?: () => void) => (
    <Pressable
      key={key}
      onPress={disabled ? undefined : onPress}
      onLongPress={onHold}
      accessibilityRole="button"
      accessibilityState={{ selected: lit, disabled }}
      accessibilityLabel={`${name}, ${sub}`}
      accessibilityActions={onHold ? [{ name: 'longpress', label: 'More Choices' }] : undefined}
      onAccessibilityAction={onHold ? (e) => e.nativeEvent.actionName === 'longpress' && onHold() : undefined}
      style={({ pressed }) => [styles.row, lit && { backgroundColor: withAlpha(t.colors.accent, 0.16) }, pressed && { opacity: 0.7 }, disabled && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={26} color={lit ? t.colors.accent : t.colors.text} />
      <View style={{ flex: 1, marginLeft: t.space.lg }}>
        <T variant="bodyStrong" color={lit ? t.colors.accent : undefined} numberOfLines={1}>
          {name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {sub}
        </T>
      </View>
      {lit ? <Ionicons name="volume-high" size={20} color={t.colors.accent} /> : null}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top > 20 ? t.space.md : t.space.lg }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Connect</T>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: t.space.md, paddingBottom: insets.bottom + t.space.xl }}>
        {row('here', 'phone-portrait-outline', 'This Phone', here ? `${playingHere ? 'Playing' : 'Paused'}: ${here.Name}` : 'Nothing playing', litHere, pickHere)}
        {devices?.map((d) =>
          row(
            d.sessionId,
            deviceIcon(d),
            d.name,
            d.controllable ? nowLine(d) : 'Update Rakki there to connect to it',
            !litHere && playingElsewhere?.sessionId === d.sessionId,
            () => pick(d),
            !d.controllable,
            () => openDeviceSheet(d),
          ),
        )}
        {devices?.length ? (
          <T variant="caption" style={styles.note}>
            Hold a device to pick: play this phone’s song there, or just control it.
          </T>
        ) : null}
        {devices === null && !error ? (
          <T variant="caption" style={styles.note}>
            Looking for your other Rakki apps
          </T>
        ) : null}
        {error ? (
          <T variant="caption" style={styles.note}>
            Couldn’t ask your server for your devices.
          </T>
        ) : null}
        <Pressable onPress={() => setHelp(!help)} accessibilityRole="button" accessibilityState={{ expanded: help }} style={styles.help}>
          <T variant="bodyStrong" color={t.colors.textSecondary}>
            Don’t See Your Device?
          </T>
          <Ionicons name={help ? 'chevron-up' : 'chevron-down'} size={18} color={t.colors.textSecondary} />
        </Pressable>
        {help ? (
          <T variant="caption" style={styles.note}>
            Open Rakki on it, signed in to the same server. Your music moves over at the same moment in the song, and this phone becomes its remote.
          </T>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.lg,
    paddingBottom: t.space.md,
  },
  // Whole rows are the touch targets (64 pt tall).
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingHorizontal: t.space.md, borderRadius: t.radius.card, marginBottom: t.space.xs },
  help: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: t.space.md, marginTop: t.space.lg },
  note: { paddingHorizontal: t.space.md, paddingTop: t.space.sm },
}));
