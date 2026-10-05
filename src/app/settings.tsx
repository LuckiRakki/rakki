import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { removeAccount, signOut, switchAccount } from '@/auth/actions';
import { changeProfilePicture } from '@/auth/profile';
import { accountKey, useAuth } from '@/auth/store';
import { useDownloads } from '@/downloads/store';
import { formatBytes, songCount } from '@/lib/format';
import { appVersion, buildStamp, checkForUpdate, getUpdateInfo, type UpdateInfo } from '@/lib/updates';
import { engine } from '@/player/engine';
import { BITRATE_OPTIONS, DOWNLOAD_QUALITY_OPTIONS, useSettings } from '@/settings/store';
import { LastfmSettings } from '@/ui/LastfmSettings';
import { Segmented } from '@/ui/Segmented';
import { Field, Toggle } from '@/ui/SettingRows';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { UserAvatar } from '@/ui/UserAvatar';

export default function SettingsScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const session = useAuth((s) => s.session);
  const accounts = useAuth((s) => s.accounts);
  const others = session ? accounts.filter((a) => accountKey(a) !== accountKey(session)) : accounts;
  const hasDownloads = useDownloads((s) => Object.keys(s.collections).length > 0);

  const confirmSignOut = () =>
    Alert.alert(
      `Sign out of ${session?.userName ?? 'this account'}?`,
      [
        hasDownloads ? 'Music downloaded with this account will be removed from this iPhone.' : '',
        others.length ? `Rakki will switch to ${others[0].userName} on ${others[0].serverName}.` : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            router.dismissAll();
            void signOut();
          },
        },
      ],
    );
  const wifi = useSettings((s) => s.wifiBitrate);
  const cellular = useSettings((s) => s.cellularBitrate);
  const downloadQuality = useSettings((s) => s.downloadQuality);
  const downloadOnCellular = useSettings((s) => s.downloadOnCellular);
  const offlineMode = useSettings((s) => s.offlineMode);
  const normalize = useSettings((s) => s.normalize);
  const autoplay = useSettings((s) => s.autoplay);
  const scrollTitles = useSettings((s) => s.scrollTitles);
  const videoAutoplay = useSettings((s) => s.videoAutoplay);
  const videoQueueSize = useSettings((s) => s.videoQueueSize);
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
            <Pressable onPress={() => void changeProfilePicture()} accessibilityLabel="Change profile picture">
              <UserAvatar size={52} />
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={12} color="#000" />
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong">{session?.userName}</T>
              <T variant="caption" style={{ marginTop: 2 }}>
                {session?.serverName} · {session?.serverUrl}
              </T>
            </View>
          </View>

          {others.length ? (
            <View style={{ marginTop: t.space.lg }}>
              <T variant="label" style={{ marginBottom: t.space.xs }}>
                Switch to
              </T>
              {others.map((a) => (
                <Pressable
                  key={accountKey(a)}
                  onPress={() => {
                    void switchAccount(a);
                    router.dismissAll();
                  }}
                  onLongPress={() =>
                    Alert.alert(`Remove ${a.userName}?`, `${a.serverName} will no longer be on this iPhone.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => void removeAccount(a) },
                    ])
                  }
                  style={({ pressed }) => [styles.accountRow, pressed && { opacity: 0.7 }]}>
                  <View style={styles.initial}>
                    <T style={{ fontFamily: t.fonts.bold, color: t.colors.text }}>{a.userName.charAt(0).toUpperCase()}</T>
                  </View>
                  <View style={{ flex: 1, marginLeft: t.space.md }}>
                    <T variant="bodyStrong">{a.userName}</T>
                    <T variant="caption" numberOfLines={1} style={{ fontSize: t.size(12) }}>
                      {a.serverName} · {a.serverUrl}
                    </T>
                  </View>
                  <Ionicons name="swap-horizontal" size={20} color={t.colors.textSecondary} />
                </Pressable>
              ))}
              <T variant="caption" style={{ fontSize: t.size(11), marginTop: t.space.xs }}>
                Hold an account to remove it.
              </T>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: t.space.sm }}>
            <Pressable
              onPress={() => router.push('/add-account')}
              style={({ pressed }) => [styles.signOut, { flex: 1 }, pressed && { opacity: 0.7 }]}>
              <T variant="bodyStrong">Add account</T>
            </Pressable>
            <Pressable onPress={confirmSignOut} style={({ pressed }) => [styles.signOut, { flex: 1 }, pressed && { opacity: 0.7 }]}>
              <T variant="bodyStrong">Sign out</T>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/customize')}
          style={({ pressed }) => [styles.card, styles.customize, { marginTop: t.space.xl }, pressed && { opacity: 0.7 }]}>
          <Ionicons name="color-palette-outline" size={24} color={t.colors.accent} />
          <View style={{ flex: 1, marginHorizontal: t.space.md }}>
            <T variant="bodyStrong">Customize</T>
            <T variant="caption" style={{ fontSize: t.size(12) }}>
              Colours, fonts, sizes, Home, player and more
            </T>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.colors.textMuted} />
        </Pressable>

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

        <T variant="label" style={styles.section}>
          Playback
        </T>
        <View style={[styles.card, { paddingTop: t.space.xs }]}>
          <Toggle
            label="Even out volume"
            detail="Turns loud songs down so everything plays at a similar level"
            value={normalize}
            onChange={(v) => useSettings.getState().set('normalize', v)}
          />
          <Toggle
            label="Autoplay"
            detail="When your queue ends, keep going with similar songs"
            value={autoplay}
            onChange={(v) => useSettings.getState().set('autoplay', v)}
          />
          <Toggle
            label="Scroll long titles"
            detail="Song titles too long to fit slide along now and then. Off: they're cut off"
            value={scrollTitles}
            onChange={(v) => useSettings.getState().set('scrollTitles', v)}
          />
          <Toggle
            label="Autoplay music videos"
            detail="When a music video ends, play another one by the same artist (or something else you have)"
            value={videoAutoplay}
            onChange={(v) => useSettings.getState().set('videoAutoplay', v)}
          />
          <Field label="Music videos queued ahead" hint="How many the video queue picks in advance. It tops up as they play.">
            <Segmented
              value={videoQueueSize}
              onChange={(v) => useSettings.getState().set('videoQueueSize', v)}
              options={[1, 2, 3, 5, 10].map((n) => ({ value: n, label: String(n) }))}
            />
          </Field>
        </View>

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

        <LastfmSettings />

        <T variant="label" style={styles.section}>
          About
        </T>
        <View style={styles.card}>
          <T variant="bodyStrong">Rakki {appVersion()}</T>
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
                  : `Updates: on (${update.channel}), ${updateLabel()} published ${update.createdAt?.toLocaleString() ?? '?'}`}
          </T>
          <T variant="caption" style={{ marginTop: 2 }}>
            {update?.runtimeVersion ? `Native build ${update.runtimeVersion}` : ' '}
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
  customize: { flexDirection: 'row', alignItems: 'center' },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: t.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: t.space.sm },
  initial: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));


/** "update 27 (4e1dd24)" for the over-the-air update that's running. */
function updateLabel(): string {
  const { update, commit } = buildStamp();
  if (!update) return 'an update';
  return commit ? `update ${update} (${commit})` : `update ${update}`;
}
