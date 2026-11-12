import { Pressable, ScrollView, View } from 'react-native';

import { tick } from '@/lib/haptics';
import { hasEqualizer } from '@/player/engine';
import { EQ_BANDS, EQ_PRESETS, eqPreset } from '@/settings/equalizer';
import { useSettings } from '@/settings/store';
import { Toggle } from '@/ui/SettingRows';
import { Slider } from '@/ui/Slider';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const hz = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f));
const db = (v: number) => `${v > 0 ? '+' : ''}${v} dB`;

/** Settings → Playback → Equalizer: presets and ten bands, applied by the native engine. */
export function EqualizerSettings() {
  const t = useTheme();
  const styles = useStyles();
  const on = useSettings((s) => s.equalizer);
  const bands = useSettings((s) => s.equalizerBands);
  const set = useSettings((s) => s.set);
  const preset = eqPreset(bands);

  return (
    <View style={[styles.card, { paddingTop: t.space.xs }]}>
      <Toggle
        label="Equalizer"
        detail={
          hasEqualizer
            ? 'Shapes the sound of every song. Songs your server converts play as they are'
            : 'Needs the next app build (a new install from the iOS page). Your settings are kept until then'
        }
        value={on}
        onChange={(v) => set('equalizer', v)}
      />
      {on ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: t.space.md }} contentContainerStyle={{ gap: t.space.sm }}>
            {EQ_PRESETS.map((p) => {
              const picked = preset === p.id;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: picked }}
                  onPress={() => {
                    tick();
                    set('equalizerBands', [...p.eq]);
                  }}
                  style={[styles.chip, picked && { backgroundColor: t.colors.text }]}>
                  <T variant="bodyStrong" color={picked ? t.colors.bg : t.colors.text} style={{ fontSize: t.size(13) }}>
                    {p.label}
                  </T>
                </Pressable>
              );
            })}
          </ScrollView>
          {EQ_BANDS.map((f, i) => (
            <View key={f} style={styles.band}>
              <T variant="caption" style={styles.hz}>
                {hz(f)}
              </T>
              <View style={{ flex: 1 }}>
                <Slider
                  value={bands[i] ?? 0}
                  min={-12}
                  max={12}
                  step={1}
                  onChange={(v) => set('equalizerBands', bands.map((g, j) => (j === i ? v : g)))}
                />
              </View>
              <T variant="caption" style={styles.db}>
                {db(bands[i] ?? 0)}
              </T>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.space.lg, marginTop: t.space.md },
  chip: { height: 32, paddingHorizontal: t.space.md, borderRadius: t.radius.pill, backgroundColor: t.colors.surface2, justifyContent: 'center' },
  band: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, marginTop: t.space.sm },
  hz: { width: 34, fontSize: t.size(12), fontVariant: ['tabular-nums'] },
  db: { width: 48, textAlign: 'right', fontSize: t.size(12), fontVariant: ['tabular-nums'] },
}));
