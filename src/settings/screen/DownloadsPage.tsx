// Settings → Downloads: quality, Offline Mode, cellular, and Manage Downloads.
import { router } from 'expo-router';
import { Pressable, Switch, View } from 'react-native';

import { useDownloads } from '@/downloads/store';
import { formatBytes, songCount } from '@/lib/format';
import { DOWNLOAD_QUALITY_OPTIONS, useSettings } from '@/settings/store';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { OptionPicker } from '@/settings/screen/OptionPicker';
import { useSettingsStyles } from '@/settings/screen/styles';

export function DownloadsPage() {
  const t = useTheme();
  const styles = useSettingsStyles();
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
        <Pressable onPress={() => router.push('/downloads')} style={({ pressed }) => [styles.outlineButton, pressed && { opacity: 0.7 }]}>
          <T variant="bodyStrong">Manage Downloads · {downloadSummary}</T>
        </Pressable>
      </View>
    </>
  );
}
