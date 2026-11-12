// Settings → About Rakki: version, audio engine, which update is running, Check for Updates.
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { appVersion, buildStamp, checkForUpdate, getUpdateInfo, type UpdateInfo } from '@/lib/updates';
import { engine } from '@/player/engine';
import { T } from '@/ui/T';
import { useSettingsStyles } from '@/settings/screen/styles';

export function AboutPage() {
  const styles = useSettingsStyles();
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
      <Pressable onPress={() => void checkForUpdate(false)} style={({ pressed }) => [styles.outlineButton, pressed && { opacity: 0.7 }]}>
        <T variant="bodyStrong">Check for Updates</T>
      </Pressable>
    </View>
  );
}

/** "update 27 (4e1dd24)" for the over-the-air update that's running. */
function updateLabel(): string {
  const { update, commit } = buildStamp();
  if (!update) return 'an update';
  return commit ? `update ${update} (${commit})` : `update ${update}`;
}
