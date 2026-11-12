// Settings → Playback: streaming quality, playback switches, music videos and the equalizer.
import { View } from 'react-native';

import { BITRATE_OPTIONS, useSettings } from '@/settings/store';
import { EqualizerSettings } from '@/ui/EqualizerSettings';
import { Segmented } from '@/ui/Segmented';
import { Field, Toggle } from '@/ui/SettingRows';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { OptionPicker } from '@/settings/screen/OptionPicker';
import { useSettingsStyles } from '@/settings/screen/styles';

export function PlaybackPage() {
  const t = useTheme();
  const styles = useSettingsStyles();
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
