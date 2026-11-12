import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { perfLogStatus, sendPerfLog } from '@/perf/log';
import { useSettings } from '@/settings/store';
import { Toggle } from '@/ui/SettingRows';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { useSettingsStyles } from '@/settings/screen/styles';

/** Settings → Performance log: on/off, what's waiting, and Send now. */
export function PerfLogSettings() {
  const t = useTheme();
  const styles = useSettingsStyles();
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
          style={({ pressed }) => [styles.outlineButton, (pressed || sending) && { opacity: 0.7 }]}>
          <T variant="bodyStrong">{sending ? 'Sending…' : 'Send It Now'}</T>
        </Pressable>
      </View>
    </>
  );
}
