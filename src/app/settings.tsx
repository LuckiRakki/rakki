import { Ionicons } from '@/ui/Icon';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { removeAccount, signOut, switchAccount } from '@/auth/actions';
import { changeProfilePicture } from '@/auth/profile';
import { accountKey, useAuth } from '@/auth/store';
import { useDownloads } from '@/downloads/store';
import { formatBytes, songCount } from '@/lib/format';
import { appVersion, buildStamp, checkForUpdate, getUpdateInfo, type UpdateInfo } from '@/lib/updates';
import { perfLogStatus, sendPerfLog } from '@/perf/log';
import { engine } from '@/player/engine';
import { BITRATE_OPTIONS, DOWNLOAD_QUALITY_OPTIONS, useSettings } from '@/settings/store';
import { EqualizerSettings } from '@/ui/EqualizerSettings';
import { LastfmSettings } from '@/ui/LastfmSettings';
import { Segmented } from '@/ui/Segmented';
import { Field, Toggle } from '@/ui/SettingRows';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { UserAvatar } from '@/ui/UserAvatar';

type Page = 'index' | 'account' | 'playback' | 'downloads' | 'connections' | 'about';

const GLASS_LABEL = { frost: 'Frost', clear: 'Clear', tint: 'Tint' } as const;
const LYRICS_LABEL: Record<string, string> = { spicy: 'Word by Word', regular: 'Line by Line' };

/**
 * Rakki 2.0's Settings: a search well, your profile, then groups (Look, Lyrics, Playback, Downloads /
 * History and Stats, Devices, Connections / About, Sign Out). Each group opens its own page here.
 */
export default function SettingsScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Page>('index');
  const [query, setQuery] = useState('');
  const session = useAuth((s) => s.session);
  const accounts = useAuth((s) => s.accounts);
  const others = session ? accounts.filter((a) => accountKey(a) !== accountKey(session)) : accounts;
  const hasDownloads = useDownloads((s) => Object.keys(s.collections).length > 0);
  const lyricsMode = useSettings((s) => s.lyricsMode);
  const lastfm = useSettings((s) => !!s.lastfmApiKey);
  const glass = t.appearance.glass;
  const downloadedSongs = useDownloads((s) => Object.values(s.tracks).filter((x) => x.state === 'done').length);

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
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            router.dismissAll();
            void signOut();
          },
        },
      ],
    );

  const lyricsStyle = () => router.push({ pathname: '/lyrics-style', params: { from: 'settings' } });
  const groups: NavRowProps[][] = [
    [
      { icon: 'color-palette-outline', label: 'Look', value: GLASS_LABEL[glass], onPress: () => router.push('/customize'), keywords: 'glass colour color font text corners motion theme pause home mini player' },
      { icon: 'mic-outline', label: 'Lyrics', value: LYRICS_LABEL[lyricsMode] ?? '', onPress: lyricsStyle, keywords: 'spicy karaoke style' },
      { icon: 'play-circle', label: 'Playback', onPress: () => setPage('playback'), keywords: 'quality streaming wifi cellular volume autoplay equalizer eq video' },
      { icon: 'cloud-download-outline', label: 'Downloads', value: downloadedSongs ? songCount(downloadedSongs) : '', onPress: () => setPage('downloads'), keywords: 'offline cellular quality' },
    ],
    [
      { icon: 'stats-chart-outline', label: 'History and Stats', value: 'On', onPress: () => router.push('/stats'), keywords: 'plays listening top artists' },
      { icon: 'laptop-outline', label: 'Devices', value: 'This iPhone', onPress: () => router.push('/devices'), keywords: 'connect handoff remote' },
      { icon: 'globe-outline', label: 'Connections', value: lastfm ? 'Last.fm' : '', onPress: () => setPage('connections'), keywords: 'lastfm last.fm performance log' },
    ],
    [
      { icon: 'information-circle-outline', label: 'About Rakki', value: appVersion(), onPress: () => setPage('about'), keywords: 'version update' },
      { icon: 'log-out-outline', label: 'Sign Out', onPress: confirmSignOut, danger: true, keywords: 'account' },
    ],
  ];
  const q = query.trim().toLowerCase();
  const shown = q ? groups.map((g) => g.filter((r) => `${r.label} ${r.keywords ?? ''}`.toLowerCase().includes(q))).filter((g) => g.length) : groups;

  const title = { index: 'Settings', account: 'Account', playback: 'Playback', downloads: 'Downloads', connections: 'Connections', about: 'About Rakki' }[page];
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={styles.header}>
        {page === 'index' ? null : (
          <Pressable hitSlop={12} onPress={() => setPage('index')} accessibilityLabel="Back to Settings" style={{ marginRight: 4 }}>
            <Ionicons name="chevron-back" size={26} color={t.colors.text} />
          </Pressable>
        )}
        <T style={styles.title}>{title}</T>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={t.colors.text} />
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: t.space.lg, paddingTop: t.space.xs, paddingBottom: insets.bottom + t.space.xxl }}>
        {page === 'index' ? (
          <>
            <View style={styles.searchWell}>
              <Ionicons name="search-outline" size={18} color={t.colors.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search Settings"
                placeholderTextColor={t.colors.textSecondary}
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
            </View>
            {q ? null : (
              <Pressable onPress={() => setPage('account')} style={({ pressed }) => [styles.profile, pressed && { opacity: 0.7 }]} accessibilityLabel={`${session?.userName ?? 'Account'}. Switch Account`}>
                <UserAvatar size={52} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <T style={{ fontFamily: t.fonts.black, fontSize: t.size(17) }}>{session?.userName}</T>
                  <T numberOfLines={1} style={{ fontFamily: t.fonts.medium, fontSize: t.size(13), color: t.colors.textSecondary, marginTop: 2 }}>
                    {session?.serverName} · {others.length ? 'Switch Account' : 'Add Account'}
                  </T>
                </View>
                <Ionicons name="chevron-forward" size={16} color={t.colors.textMuted} />
              </Pressable>
            )}
            {shown.map((g, i) => (
              <View key={i} style={{ marginTop: 20 }}>
                {g.map((r, j) => (
                  <NavRow key={r.label} {...r} first={j === 0} last={j === g.length - 1} />
                ))}
              </View>
            ))}
            {q && shown.length === 0 ? (
              <T variant="caption" style={{ marginTop: t.space.xl, textAlign: 'center' }}>
                No settings match.
              </T>
            ) : null}
          </>
        ) : page === 'account' ? (
          <AccountPage others={others} />
        ) : page === 'playback' ? (
          <PlaybackPage />
        ) : page === 'downloads' ? (
          <DownloadsPage />
        ) : page === 'connections' ? (
          <>
            <LastfmSettings />
            <PerfLogSettings />
          </>
        ) : (
          <AboutPage />
        )}
      </ScrollView>
    </View>
  );
}

interface NavRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
  keywords?: string;
}

/** A Settings row: an icon tile, the name, its current value and a chevron, joined into rounded groups. */
function NavRow({ icon, label, value, onPress, danger, first, last }: NavRowProps & { first: boolean; last: boolean }) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [
        styles.navRow,
        { borderTopLeftRadius: first ? 16 : 0, borderTopRightRadius: first ? 16 : 0, borderBottomLeftRadius: last ? 16 : 0, borderBottomRightRadius: last ? 16 : 0 },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={[styles.tile, danger && { backgroundColor: 'rgba(255,84,112,0.16)' }]}>
        <Ionicons name={icon} size={18} color={danger ? t.colors.danger : t.colors.text} />
      </View>
      <T style={{ flex: 1, fontFamily: t.fonts.semibold, fontSize: t.size(16), color: danger ? t.colors.danger : t.colors.text }}>{label}</T>
      {value ? <T style={{ fontFamily: t.fonts.medium, fontSize: t.size(15), color: t.colors.textSecondary, marginRight: 6 }}>{value}</T> : null}
      {danger ? null : <Ionicons name="chevron-forward" size={16} color={t.colors.textMuted} />}
      {last ? null : <View style={styles.rowLine} />}
    </Pressable>
  );
}

function AccountPage({ others }: { others: ReturnType<typeof useAuth.getState>['accounts'] }) {
  const t = useTheme();
  const styles = useStyles();
  const session = useAuth((s) => s.session);
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
        <Pressable onPress={() => void changeProfilePicture()} accessibilityLabel="Change Profile Picture">
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
          <T style={styles.sectionTitle}>Switch To</T>
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

      <Pressable onPress={() => router.push('/add-account')} style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}>
        <T variant="bodyStrong">Add Account</T>
      </Pressable>
    </View>
  );
}

function PlaybackPage() {
  const t = useTheme();
  const styles = useStyles();
  const wifi = useSettings((s) => s.wifiBitrate);
  const cellular = useSettings((s) => s.cellularBitrate);
  const normalize = useSettings((s) => s.normalize);
  const autoplay = useSettings((s) => s.autoplay);
  const scrollTitles = useSettings((s) => s.scrollTitles);
  const videoAutoplay = useSettings((s) => s.videoAutoplay);
  const videoQueueSize = useSettings((s) => s.videoQueueSize);
  const videoBackgroundAudio = useSettings((s) => s.videoBackgroundAudio);
  return (
    <>
      <OptionPicker options={BITRATE_OPTIONS} title="Streaming Quality on Wi-Fi" value={wifi} onChange={(v) => useSettings.getState().set('wifiBitrate', v)} />
      <OptionPicker
        options={BITRATE_OPTIONS}
        title="Streaming Quality on Cellular"
        value={cellular}
        onChange={(v) => useSettings.getState().set('cellularBitrate', v)}
      />
      <T variant="caption" style={{ marginTop: t.space.sm, fontSize: t.size(12) }}>
        Applies to songs that haven&apos;t started buffering yet. Anything above the limit is converted to AAC by your server.
      </T>

      <T style={styles.sectionTitle}>Playback</T>
      <View style={[styles.card, { paddingTop: t.space.xs }]}>
        <Toggle
          label="Even Out Volume"
          detail="Turns loud songs down so everything plays at a similar level"
          value={normalize}
          onChange={(v) => useSettings.getState().set('normalize', v)}
        />
        <Toggle label="Autoplay" detail="When your queue ends, keep going with similar songs" value={autoplay} onChange={(v) => useSettings.getState().set('autoplay', v)} />
        <Toggle
          label="Scroll Long Titles"
          detail="Song titles too long to fit slide along now and then. Off: they're cut off"
          value={scrollTitles}
          onChange={(v) => useSettings.getState().set('scrollTitles', v)}
        />
        <Toggle
          label="Autoplay Music Videos"
          detail="When a music video ends, play another one by the same artist (or something else you have)"
          value={videoAutoplay}
          onChange={(v) => useSettings.getState().set('videoAutoplay', v)}
        />
        <Toggle
          label="Play Music Videos in the Background"
          detail="The sound keeps going when you leave Rakki or lock your phone"
          value={videoBackgroundAudio}
          onChange={(v) => useSettings.getState().set('videoBackgroundAudio', v)}
        />
        <Field label="Music Videos Queued Ahead" hint="How many the video queue picks in advance. It tops up as they play.">
          <Segmented
            value={videoQueueSize}
            onChange={(v) => useSettings.getState().set('videoQueueSize', v)}
            options={[1, 2, 3, 5, 10].map((n) => ({ value: n, label: String(n) }))}
          />
        </Field>
      </View>
      <EqualizerSettings />
    </>
  );
}

function DownloadsPage() {
  const t = useTheme();
  const styles = useStyles();
  const downloadQuality = useSettings((s) => s.downloadQuality);
  const downloadOnCellular = useSettings((s) => s.downloadOnCellular);
  const offlineMode = useSettings((s) => s.offlineMode);
  const downloadSummary = useDownloads((s) => {
    const done = Object.values(s.tracks).filter((x) => x.state === 'done');
    return done.length ? `${songCount(done.length)}, ${formatBytes(done.reduce((n, x) => n + (x.bytes ?? 0), 0))}` : 'None Yet';
  });
  return (
    <>
      <OptionPicker
        options={DOWNLOAD_QUALITY_OPTIONS}
        title="Download Quality"
        value={downloadQuality}
        onChange={(v) => useSettings.getState().set('downloadQuality', v)}
      />
      <T variant="caption" style={{ marginTop: t.space.sm, fontSize: t.size(12) }}>
        Applies to new downloads. MP3s and other compressed files are always kept as they are.
      </T>
      <View style={[styles.card, { marginTop: t.space.md }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: t.space.lg }}>
          <View style={{ flex: 1, marginRight: t.space.md }}>
            <T variant="bodyStrong">Offline Mode</T>
            <T variant="caption" style={{ fontSize: t.size(12) }}>
              Only play what&apos;s downloaded. Rakki also does this on its own when your server can&apos;t be reached.
            </T>
          </View>
          <Switch value={offlineMode} onValueChange={(v) => useSettings.getState().set('offlineMode', v)} trackColor={{ true: t.colors.accent, false: t.colors.surface3 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, marginRight: t.space.md }}>
            <T variant="bodyStrong">Download Using Cellular</T>
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
        <Pressable onPress={() => router.push('/downloads')} style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}>
          <T variant="bodyStrong">Manage Downloads · {downloadSummary}</T>
        </Pressable>
      </View>
    </>
  );
}

function AboutPage() {
  const styles = useStyles();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    void getUpdateInfo().then(setUpdate);
  }, []);
  return (
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
      <Pressable onPress={() => void checkForUpdate(false)} style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}>
        <T variant="bodyStrong">Check for Updates</T>
      </Pressable>
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
      <T style={styles.sectionTitle}>{title}</T>
      <View style={[styles.card, { paddingVertical: t.space.xs }]}>
        {options.map((o) => (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={styles.option}>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong" color={o.value === value ? t.colors.accentText : t.colors.text}>
                {o.label}
              </T>
              <T variant="caption" style={{ fontSize: t.size(12) }}>
                {o.detail}
              </T>
            </View>
            {o.value === value ? <Ionicons name="checkmark" size={20} color={t.colors.accentText} /> : null}
          </Pressable>
        ))}
      </View>
    </>
  );
}

/** Settings → Performance log: on/off, what's waiting, and Send now. */
function PerfLogSettings() {
  const t = useTheme();
  const styles = useStyles();
  const on = useSettings((s) => s.perfLog);
  const [status, setStatus] = useState<{ rows: number; sentAt: number | null } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void perfLogStatus().then(setStatus);
  }, []);

  const send = async () => {
    setSending(true);
    try {
      const rows = await sendPerfLog();
      Alert.alert('Sent', rows ? `${rows} entries are on your server now (Dashboard → Logs).` : 'Nothing new to send yet.');
    } catch (e) {
      Alert.alert('Couldn’t send it', e instanceof Error ? e.message : 'Try again later.');
    } finally {
      setSending(false);
      void perfLogStatus().then(setStatus);
    }
  };

  return (
    <>
      <T style={styles.sectionTitle}>Performance Log</T>
      <View style={[styles.card, { paddingTop: t.space.xs }]}>
        <Toggle
          label="Keep a Performance Log"
          detail="About once a minute: what Rakki is doing, CPU, memory, heat and battery. Sent to your server every 12 hours"
          value={on}
          onChange={(v) => useSettings.getState().set('perfLog', v)}
        />
        <T variant="caption" style={{ marginTop: t.space.md, fontSize: t.size(12) }}>
          {status
            ? `${status.rows} entries waiting · last sent ${status.sentAt ? new Date(status.sentAt).toLocaleString() : 'never'}`
            : ' '}
        </T>
        <Pressable
          disabled={sending}
          onPress={() => void send()}
          style={({ pressed }) => [styles.signOut, (pressed || sending) && { opacity: 0.7 }]}>
          <T variant="bodyStrong">{sending ? 'Sending…' : 'Send It Now'}</T>
        </Pressable>
      </View>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingLeft: t.space.md,
    paddingRight: t.space.lg,
  },
  title: { flex: 1, fontFamily: t.fonts.black, fontSize: t.size(26), letterSpacing: -0.4, marginLeft: 4 },
  sectionTitle: { marginTop: t.space.xl, marginBottom: 10, marginHorizontal: 4, fontFamily: t.fonts.bold, fontSize: t.size(13), color: t.colors.textSecondary },
  card: { backgroundColor: t.colors.row, borderRadius: 16, padding: 14 },
  searchWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: { flex: 1, height: 40, fontFamily: t.fonts.medium, fontSize: t.size(15), color: t.colors.text },
  profile: { flexDirection: 'row', alignItems: 'center', marginTop: t.space.lg, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.colors.row },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 14, backgroundColor: t.colors.row },
  tile: { width: 30, height: 30, borderRadius: 8, backgroundColor: t.colors.surface3, alignItems: 'center', justifyContent: 'center' },
  rowLine: { position: 'absolute', left: 58, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },
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
