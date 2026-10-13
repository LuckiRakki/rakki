import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDuration, ticksToSeconds } from '@/lib/format';
import { useAuth } from '@/auth/store';
import { tick } from '@/lib/haptics';
import { engine } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { control, otherRakkiDevices, positionNow, pullFrom, pushTo, type RakkiDevice } from '@/remote/devices';
import { Artwork } from '@/ui/Artwork';
import { showToast } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const REFRESH_MS = 3000;

/**
 * Your devices (playing across devices, docs/REMOTE_PLAYBACK.md): your other Rakki apps on this
 * server (the computer) and what each is playing. Control one from here, take its music over
 * ("Play here"), or send this phone's music to it ("Play on computer"), at the same moment.
 */
export default function DevicesScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const client = useAuth((s) => s.client);
  const [devices, setDevices] = useState<RakkiDevice[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, redraw] = useState(0);
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
    // The places in the songs move on between checks.
    const clock = setInterval(() => redraw((n) => n + 1), 1000);
    return () => {
      alive = false;
      clearInterval(id);
      clearInterval(clock);
    };
  }, [client]);

  const send = (d: RakkiDevice, cmd: 'PlayPause' | 'NextTrack' | 'PreviousTrack') => {
    if (!client) return;
    tick();
    // Shown at once; the next check corrects it.
    if (cmd === 'PlayPause') setDevices((list) => list?.map((x) => (x.sessionId === d.sessionId ? { ...x, paused: !x.paused, reportedSec: positionNow(x), reportedAt: Date.now() } : x)) ?? null);
    void control(client, d, cmd).catch(() => showToast(`Couldn’t reach ${d.name}`));
  };

  const playHere = async (d: RakkiDevice) => {
    if (!client || busy) return;
    tick();
    setBusy(`Taking over from ${d.name}…`);
    try {
      const h = await pullFrom(client, d);
      if (!h.items.length) return showToast(`Nothing to take over from ${d.name}`);
      usePlayer.getState().playQueue(h.items, { startIndex: h.index, shuffle: false });
      if (h.positionSec > 1) setTimeout(() => usePlayer.getState().seek(h.positionSec), 700);
      await h.release();
      showToast(`Playing here (from ${d.name})`);
      router.back();
    } catch {
      showToast(`Couldn’t take over from ${d.name}`);
    } finally {
      setBusy(null);
    }
  };

  const playOn = async (d: RakkiDevice) => {
    const p = usePlayer.getState();
    if (!client || busy || !p.queue.length) return;
    tick();
    setBusy(`Moving to ${d.name}…`);
    try {
      const ok = await pushTo(client, d, p.queue.map((e) => e.item), p.index, engine.getProgress().position);
      if (!ok) return showToast(`${d.name} didn’t start. Open Rakki there and try again.`);
      if (usePlayer.getState().playing) usePlayer.getState().toggle();
      showToast(`Playing on ${d.name}`);
    } catch {
      showToast(`Couldn’t reach ${d.name}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top > 20 ? t.space.md : t.space.lg }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Your devices</T>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xl }}>
        <View style={styles.device}>
          <Ionicons name="phone-portrait" size={24} color={t.colors.accent} style={styles.icon} />
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong" color={t.colors.accent}>
              This phone
            </T>
            <T variant="caption" numberOfLines={1}>
              {here ? `${playingHere ? 'Playing' : 'Paused'}: ${here.Name}` : 'Nothing playing here'}
            </T>
          </View>
        </View>

        {devices === null && !error ? <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} /> : null}
        {error ? (
          <T variant="caption" style={styles.note}>
            Couldn’t ask the server.
          </T>
        ) : null}
        {devices && !devices.length ? (
          <T variant="caption" style={styles.note}>
            No other Rakki apps are signed in right now. Open Rakki on your computer to see it here.
          </T>
        ) : null}

        {devices?.map((d) => {
          const length = ticksToSeconds(d.item?.RunTimeTicks);
          const at = Math.min(positionNow(d), length || Infinity);
          return (
            <View key={d.sessionId} style={styles.device}>
              <Ionicons
                name={/iphone|ipad|ios|android|phone/i.test(d.name) ? 'phone-portrait-outline' : 'desktop-outline'}
                size={24}
                color={d.item && !d.paused ? t.colors.accent : t.colors.textSecondary}
                style={styles.icon}
              />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">{d.name}</T>
                {d.item ? (
                  <View style={styles.song}>
                    <Artwork item={d.item} size={44} rounded={4} />
                    <View style={{ flex: 1, marginLeft: t.space.md }}>
                      <T variant="bodyStrong" numberOfLines={1}>
                        {d.item.Name}
                      </T>
                      <T variant="caption" numberOfLines={1}>
                        {`${d.item.Artists?.join(', ') ?? ''} · ${d.paused ? 'Paused' : 'Playing'} ${formatDuration(at)}${length ? ` / ${formatDuration(length)}` : ''}`}
                      </T>
                    </View>
                  </View>
                ) : (
                  <T variant="caption">Not playing</T>
                )}
                {d.controllable ? (
                  <View style={styles.actions}>
                    {d.item ? (
                      <>
                        <Pressable hitSlop={8} onPress={() => send(d, 'PreviousTrack')} accessibilityLabel="Previous">
                          <Ionicons name="play-skip-back" size={22} color={t.colors.text} />
                        </Pressable>
                        <Pressable hitSlop={8} onPress={() => send(d, 'PlayPause')} accessibilityLabel={d.paused ? 'Play' : 'Pause'}>
                          <Ionicons name={d.paused ? 'play' : 'pause'} size={26} color={t.colors.text} />
                        </Pressable>
                        <Pressable hitSlop={8} onPress={() => send(d, 'NextTrack')} accessibilityLabel="Next">
                          <Ionicons name="play-skip-forward" size={22} color={t.colors.text} />
                        </Pressable>
                        <View style={{ flex: 1 }} />
                        <Pressable disabled={!!busy} onPress={() => void playHere(d)} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}>
                          <Ionicons name="arrow-down" size={14} color={t.colors.text} />
                          <T style={styles.pillText}>Play here</T>
                        </Pressable>
                      </>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                    {here ? (
                      <Pressable disabled={!!busy} onPress={() => void playOn(d)} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}>
                        <Ionicons name="arrow-up" size={14} color={t.colors.text} />
                        <T style={styles.pillText}>Play there</T>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <T variant="caption" style={{ marginTop: t.space.xs }}>
                    Update Rakki there to control it from here.
                  </T>
                )}
              </View>
            </View>
          );
        })}

        <T variant="caption" style={styles.note}>
          {busy ?? 'Moving music picks up at the same moment in the song.'}
        </T>
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
    paddingBottom: t.space.sm,
  },
  device: { flexDirection: 'row', paddingHorizontal: t.space.lg, paddingVertical: t.space.md },
  icon: { marginRight: t.space.md, marginTop: 2 },
  song: { flexDirection: 'row', alignItems: 'center', marginTop: t.space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: t.space.lg, marginTop: t.space.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: t.space.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.colors.surface2,
  },
  pillText: { fontFamily: t.fonts.semibold, fontSize: t.size(13) },
  note: { paddingHorizontal: t.space.lg, paddingTop: t.space.lg },
}));
