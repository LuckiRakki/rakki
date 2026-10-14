import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/store';
import { withAlpha } from '@/lib/color';
import { tick } from '@/lib/haptics';
import { engine } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { otherRakkiDevices, pullFrom, pushTo, type RakkiDevice } from '@/remote/devices';
import { showToast } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const REFRESH_MS = 3000;
/** Music being moved: one at a time. The screen closes at once. */
let moving = false;

const isPhone = (d: { name: string }) => /iphone|ipad|ios|android|phone/i.test(d.name);

function nowLine(d: RakkiDevice): string {
  if (!d.item) return 'Not playing';
  const who = d.item.Artists?.join(', ') ?? d.item.AlbumArtist;
  return `${d.paused ? 'Paused' : 'Playing'}: ${d.item.Name}${who ? ` · ${who}` : ''}`;
}

/**
 * Connect, like Spotify's (and the desktop's): this phone and your other Rakki apps on this
 * server (docs/REMOTE_PLAYBACK.md), the one playing lit. Tap a device to listen there: the
 * music moves over at the same moment in the song. Tap This Phone to bring it back. The screen
 * closes at once; a toast says when it's playing (or why not).
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
  const playingElsewhere = devices?.find((d) => d.item && !d.paused && d.controllable);
  const litHere = playingHere || !playingElsewhere;

  /** Bring the music here from the device that's playing it. */
  const pickHere = async () => {
    const d = playingElsewhere;
    if (!client || moving || litHere || !d) return;
    tick();
    moving = true;
    router.back();
    try {
      const h = await pullFrom(client, d);
      if (!h.items.length) return showToast(`Nothing to take over from ${d.name}`);
      usePlayer.getState().playQueue(h.items, { startIndex: h.index, shuffle: false });
      if (h.positionSec > 1) setTimeout(() => usePlayer.getState().seek(h.positionSec), 700);
      await h.release();
      showToast(`Playing on This Phone (from ${d.name})`);
    } catch {
      showToast(`Couldn’t take over from ${d.name}`);
    } finally {
      moving = false;
    }
  };

  /** Move this phone's music to another device. */
  const pick = async (d: RakkiDevice) => {
    const p = usePlayer.getState();
    if (!client || moving || playingElsewhere?.sessionId === d.sessionId) return;
    if (!p.queue.length) return showToast('Play something here first, then move it');
    tick();
    moving = true;
    router.back();
    try {
      const ok = await pushTo(client, d, p.queue.map((e) => e.item), p.index, engine.getProgress().position);
      if (!ok) return showToast(`${d.name} didn’t start. Open Rakki there and try again.`);
      if (usePlayer.getState().playing) usePlayer.getState().toggle();
      showToast(`Playing on ${d.name}`);
    } catch {
      showToast(`Couldn’t reach ${d.name}`);
    } finally {
      moving = false;
    }
  };

  const row = (key: string, icon: keyof typeof Ionicons.glyphMap, name: string, sub: string, lit: boolean, onPress: () => void, disabled = false) => (
    <Pressable
      key={key}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: lit, disabled }}
      accessibilityLabel={`${name}, ${sub}`}
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
        {row('here', 'phone-portrait-outline', 'This Phone', here ? `${playingHere ? 'Playing' : 'Paused'}: ${here.Name}` : 'Nothing playing', litHere, () => void pickHere())}
        {devices?.map((d) =>
          row(
            d.sessionId,
            isPhone(d) ? 'phone-portrait-outline' : 'laptop-outline',
            d.name,
            d.controllable ? nowLine(d) : 'Update Rakki there to connect to it',
            !litHere && playingElsewhere?.sessionId === d.sessionId,
            () => void pick(d),
            !d.controllable,
          ),
        )}
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
            Open Rakki on it, signed in to the same server. Your music moves over at the same moment in the song.
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
