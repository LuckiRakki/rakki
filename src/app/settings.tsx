import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CLIENT_VERSION } from '@/api/jellyfin';
import { signOut } from '@/auth/actions';
import { useAuth } from '@/auth/store';
import { useDownloads } from '@/downloads/store';
import { formatBytes, songCount } from '@/lib/format';
import { buildStamp, checkForUpdate, getUpdateInfo, versionLabel, type UpdateInfo } from '@/lib/updates';
import { engine } from '@/player/engine';
import { BITRATE_OPTIONS, DOWNLOAD_QUALITY_OPTIONS, useSettings } from '@/settings/store';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { UserAvatar } from '@/ui/UserAvatar';

export default function SettingsScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const session = useAuth((s) => s.session);
  const wifi = useSettings((s) => s.wifiBitrate);
  const cellular = useSettings((s) => s.cellularBitrate);
  const downloadQuality = useSettings((s) => s.downloadQuality);
  const downloadOnCellular = useSettings((s) => s.downloadOnCellular);
  const offlineMode = useSettings((s) => s.offlineMode);
  const downloadSummary = useDownloads((s) => {
    const done = Object.values(s.tracks).filter((x) => x.state === 'done');
    return done.length ? `${songCount(done.length)}, ${formatBytes(done.reduce((n, x) => n + (x.bytes ?? 0), 0))}` : 'none yet';
  });
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    void getUpdateInfo().then(setUpdate);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Settings</T>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={t.colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: t.space.lg, paddingBottom: insets.bottom + t.space.xxl }}>
        <T variant="label" style={styles.section}>
          Account
        </T>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
            <UserAvatar size={48} />
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong">{session?.userName}</T>
              <T variant="caption" style={{ marginTop: 2 }}>
                {session?.serverName} · {session?.serverUrl}
              </T>
            </View>
          </View>
          <Pressable
            onPress={() => {
              router.back();
              void signOut();
            }}
            style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}>
            <T variant="bodyStrong">Sign out</T>
          </Pressable>
        </View>

        <OptionPicker
          options={BITRATE_OPTIONS}
          title="Streaming quality on Wi-Fi"
          value={wifi}
          onChange={(v) => useSettings.getState().set('wifiBitrate', v)}
        />
        <OptionPicker
          options={BITRATE_OPTIONS}
          title="Streaming quality on cellular"
          value={cellular}
          onChange={(v) => useSettings.getState().set('cellularBitrate', v)}
        />
        <T variant="caption" style={{ marginTop: t.space.sm, fontSize: t.size(12) }}>
          Applies to songs that haven&apos;t started buffering yet. Anything above the limit is
          converted to AAC by your server.
        </T>

        <OptionPicker
          options={DOWNLOAD_QUALITY_OPTIONS}
          title="Download quality"
          value={downloadQuality}
          onChange={(v) => useSettings.getState().set('downloadQuality', v)}
        />
        <T variant="caption" style={{ marginTop: t.space.sm, fontSize: t.size(12) }}>
          Applies to new downloads. MP3s and other compressed files are always kept as they are.
        </T>
        <View style={[styles.card, { marginTop: t.space.md }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: t.space.lg }}>
            <View style={{ flex: 1, marginRight: t.space.md }}>
              <T variant="bodyStrong">Offline mode</T>
              <T variant="caption" style={{ fontSize: t.size(12) }}>
                Only play what&apos;s downloaded. Rakki also does this on its own when your server
                can&apos;t be reached.
              </T>
            </View>
            <Switch
              value={offlineMode}
              onValueChange={(v) => useSettings.getState().set('offlineMode', v)}
              trackColor={{ true: t.colors.accent, false: t.colors.surface3 }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: t.space.md }}>
              <T variant="bodyStrong">Download using cellular</T>
              <T variant="caption" style={{ fontSize: t.size(12) }}>
                Off: downloads wait for Wi-Fi.
              </T>
            </View>
            <Switch
              value={downloadOnCellular}
              onValueChange={(v) => useSettings.getState().set('downloadOnCellular', v)}
              trackColor={{ true: t.colors.accent, false: t.colors.surface3 }}
            />
          </View>
          <Pressable
            onPress={() => router.push('/downloads')}
            style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}>
            <T variant="bodyStrong">Manage downloads · {downloadSummary}</T>
          </Pressable>
        </View>

        <T variant="label" style={styles.section}>
          About
        </T>
        <View style={styles.card}>
          <T variant="bodyStrong">Rakki {versionLabel(CLIENT_VERSION)}</T>
          <T variant="caption" style={{ marginTop: 2 }}>
            Audio engine: {engine.native ? 'Rakki native (gapless, lock screen)' : 'Basic (Expo Go / web preview)'}
          </T>
          <T variant="caption" style={{ marginTop: 2 }}>
            {update === null
              ? ' '
              : !update.enabled
                ? 'Updates: live from the PC (dev build)'
                : update.embedded
                  ? `Updates: on (${update.channel}), running the built-in version`
                  : `Updates: on (${update.channel}), published ${update.createdAt?.toLocaleString() ?? '?'}${
                      buildStamp().commit ? ` · ${buildStamp().commit}` : ''
                    }`}
          </T>
          <Pressable
            onPress={() => void checkForUpdate(false)}
            style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}>
            <T variant="bodyStrong">Check for updates</T>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function OptionPicker<V extends string | number>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { value: V; label: string; detail: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <>
      <T variant="label" style={styles.section}>
        {title}
      </T>
      <View style={[styles.card, { paddingVertical: t.space.xs }]}>
        {options.map((o) => (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={styles.option}>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong" color={o.value === value ? t.colors.accent : t.colors.text}>
                {o.label}
              </T>
              <T variant="caption" style={{ fontSize: t.size(12) }}>
                {o.detail}
              </T>
            </View>
            {o.value === value ? <Ionicons name="checkmark" size={20} color={t.colors.accent} /> : null}
          </Pressable>
        ))}
      </View>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md,
  },
  section: { marginTop: t.space.xl, marginBottom: t.space.sm },
  card: { backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.space.lg },
  signOut: {
    marginTop: t.space.lg,
    height: 42,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: t.space.sm },
}));
