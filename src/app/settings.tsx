import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CLIENT_VERSION } from '@/api/jellyfin';
import { signOut } from '@/auth/actions';
import { useAuth } from '@/auth/store';
import { checkForUpdate, getUpdateInfo, type UpdateInfo } from '@/lib/updates';
import { engine } from '@/player/engine';
import { BITRATE_OPTIONS, useSettings, type Bitrate } from '@/settings/store';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

export default function SettingsScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const session = useAuth((s) => s.session);
  const wifi = useSettings((s) => s.wifiBitrate);
  const cellular = useSettings((s) => s.cellularBitrate);
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
          <T variant="bodyStrong">{session?.userName}</T>
          <T variant="caption" style={{ marginTop: 2 }}>
            {session?.serverName} · {session?.serverUrl}
          </T>
          <Pressable
            onPress={() => {
              router.back();
              void signOut();
            }}
            style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}>
            <T variant="bodyStrong">Sign out</T>
          </Pressable>
        </View>

        <QualityPicker title="Streaming quality on Wi-Fi" value={wifi} onChange={(v) => useSettings.getState().set('wifiBitrate', v)} />
        <QualityPicker
          title="Streaming quality on cellular"
          value={cellular}
          onChange={(v) => useSettings.getState().set('cellularBitrate', v)}
        />
        <T variant="caption" style={{ marginTop: t.space.sm, fontSize: t.size(12) }}>
          Applies to songs that haven&apos;t started buffering yet. Anything above the limit is
          converted to AAC by your server.
        </T>

        <T variant="label" style={styles.section}>
          About
        </T>
        <View style={styles.card}>
          <T variant="bodyStrong">Rakki {CLIENT_VERSION}</T>
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
                  : `Updates: on (${update.channel}), update from ${update.createdAt?.toLocaleString() ?? '?'}`}
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

function QualityPicker({
  title,
  value,
  onChange,
}: {
  title: string;
  value: Bitrate;
  onChange: (v: Bitrate) => void;
}) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <>
      <T variant="label" style={styles.section}>
        {title}
      </T>
      <View style={[styles.card, { paddingVertical: t.space.xs }]}>
        {BITRATE_OPTIONS.map((o) => (
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
