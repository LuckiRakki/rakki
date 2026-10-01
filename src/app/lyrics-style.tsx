import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { DEMO_LYRICS, LOOP_MS } from '@/lyrics/demo';
import { LyricsStage } from '@/lyrics/LyricsStage';
import { useLyricsStyle, type LyricsStyle } from '@/lyrics/style';
import { usePlayer } from '@/player/store';
import { useSettings, type LyricsMode } from '@/settings/store';
import type { SpicySettings } from '@/spicy/settings';
import { Segmented } from '@/ui/Segmented';
import { Field, SettingSection, Toggle } from '@/ui/SettingRows';
import { Slider } from '@/ui/Slider';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const PREVIEW_HEIGHT = 300;

const spicy = <K extends keyof SpicySettings>(key: K, value: SpicySettings[K]) => useLyricsStyle.getState().setSpicy(key, value);
const set = <K extends keyof LyricsStyle>(key: K, value: LyricsStyle[K]) => useLyricsStyle.getState().set(key, value);
const times = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Customize → Lyrics style: both lyric systems' look, with a live preview of made-up lyrics
 * looping over the album that's playing.
 */
export default function LyricsStyleScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const defaultMode = useSettings((s) => s.lyricsMode);
  const [mode, setMode] = useState<LyricsMode>(defaultMode);
  const style = useLyricsStyle();
  const s = style.spicy;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Lyrics style</T>
        <View style={{ width: 28 }} />
      </View>

      <View style={{ paddingHorizontal: t.space.lg }}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'spicy', label: 'Spicy' },
            { value: 'regular', label: 'Regular' },
          ]}
        />
        <Preview mode={mode} />
      </View>

      <ScrollView contentContainerStyle={{ padding: t.space.lg, paddingTop: 0, paddingBottom: insets.bottom + t.space.xxl }}>
        <SettingSection title="Lyrics open in">
          <View style={{ marginTop: t.space.md }}>
            <Segmented
              value={defaultMode}
              onChange={(v) => useSettings.getState().set('lyricsMode', v)}
              options={[
                { value: 'spicy', label: 'Spicy' },
                { value: 'regular', label: 'Regular' },
              ]}
            />
          </View>
        </SettingSection>

        {mode === 'spicy' ? (
          <>
            <SettingSection title="Spicy · words" onReset={() => useLyricsStyle.getState().resetSpicy()}>
              <Toggle label="Glow" detail="Words light up as they're sung" value={s.glowEnabled} onChange={(v) => spicy('glowEnabled', v)} />
              {s.glowEnabled ? (
                <Field label="Glow strength" value={times(s.glowStrength)}>
                  <Slider value={s.glowStrength} min={0} max={2} step={0.05} onChange={(v) => spicy('glowStrength', v)} />
                </Field>
              ) : null}
              <Field label="Word pop" value={times(s.wordPop)} hint="How much a word grows as it's sung">
                <Slider value={s.wordPop} min={0} max={2} step={0.05} onChange={(v) => spicy('wordPop', v)} />
              </Field>
              <Field label="Word lift" value={times(s.wordLift)} hint="How far it rises">
                <Slider value={s.wordLift} min={0} max={2} step={0.05} onChange={(v) => spicy('wordLift', v)} />
              </Field>
              <Field label="Highlight edge" value={`${s.sweepBand}%`} hint="How soft the edge of the colour sweep is">
                <Slider value={s.sweepBand} min={5} max={60} step={1} onChange={(v) => spicy('sweepBand', v)} />
              </Field>
            </SettingSection>

            <SettingSection title="Spicy · long notes">
              <Toggle
                label="Letter by letter"
                detail="Long held words light up one letter at a time"
                value={s.spellingEnabled}
                onChange={(v) => spicy('spellingEnabled', v)}
              />
              {s.spellingEnabled ? (
                <>
                  <Field label="Letter pop" value={times(s.letterPop)}>
                    <Slider value={s.letterPop} min={0} max={2} step={0.05} onChange={(v) => spicy('letterPop', v)} />
                  </Field>
                  <Field label="Letter glow" value={times(s.letterGlow)}>
                    <Slider value={s.letterGlow} min={0} max={2} step={0.05} onChange={(v) => spicy('letterGlow', v)} />
                  </Field>
                </>
              ) : null}
            </SettingSection>

            <SettingSection title="Spicy · motion">
              <Field label="Speed" value={times(s.motionSpeed)} hint="How quickly words react">
                <Slider value={s.motionSpeed} min={0.5} max={2} step={0.05} onChange={(v) => spicy('motionSpeed', v)} />
              </Field>
              <Field label="Calm" value={times(s.motionDamping)} hint="Higher settles without bouncing; lower is springier">
                <Slider value={s.motionDamping} min={0.5} max={2} step={0.05} onChange={(v) => spicy('motionDamping', v)} />
              </Field>
            </SettingSection>

            <SettingSection title="Spicy · other lines">
              <Toggle label="Blur" detail="Lines further from the one being sung blur more" value={s.lineBlurEnabled} onChange={(v) => spicy('lineBlurEnabled', v)} />
              {s.lineBlurEnabled ? (
                <Field label="Blur amount" value={times(s.blurPerLine / 1.25)}>
                  <Slider value={s.blurPerLine} min={0.25} max={3} step={0.05} onChange={(v) => spicy('blurPerLine', v)} />
                </Field>
              ) : null}
              <Toggle label="Line glow" detail="Lines without word timing glow as a whole" value={s.lineGlowEnabled} onChange={(v) => spicy('lineGlowEnabled', v)} />
              <Field label="Pause dots after" value={`${Math.round(s.gapDotsMs / 1000)} s`} hint="Three dots bounce through instrumental breaks this long">
                <Slider value={s.gapDotsMs} min={2000} max={10000} step={500} onChange={(v) => spicy('gapDotsMs', v)} />
              </Field>
              <Field label="Dot bounce" value={times(s.dotRise / 0.95)}>
                <Slider value={s.dotRise} min={0} max={1.5} step={0.05} onChange={(v) => spicy('dotRise', v)} />
              </Field>
            </SettingSection>

            <SettingSection title="Spicy · text">
              <Field label="Text size" value={times(style.spicySize)}>
                <Slider value={style.spicySize} min={0.8} max={1.3} step={0.05} onChange={(v) => set('spicySize', v)} />
              </Field>
              <Field label="Font">
                <Segmented
                  value={style.spicyFont}
                  onChange={(v) => set('spicyFont', v)}
                  options={[
                    { value: 'inter', label: 'Spicy (Inter)' },
                    { value: 'app', label: 'Same as app' },
                  ]}
                />
              </Field>
              <Field label="Alignment">
                <Segmented
                  value={s.align}
                  onChange={(v) => spicy('align', v)}
                  options={[
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Centre' },
                  ]}
                />
              </Field>
              <Field label="Colour">
                <Segmented
                  value={style.spicyColor}
                  onChange={(v) => set('spicyColor', v)}
                  options={[
                    { value: 'white', label: 'White' },
                    { value: 'accent', label: 'Accent' },
                  ]}
                />
              </Field>
            </SettingSection>

            <SettingSection title="Spicy · background">
              <Field label="Movement" value={style.backdropMotion === 0 ? 'Still' : times(style.backdropMotion)}>
                <Slider value={style.backdropMotion} min={0} max={2} step={0.1} onChange={(v) => set('backdropMotion', v)} />
              </Field>
              <Field label="Blur" value={times(style.backdropBlur)}>
                <Slider value={style.backdropBlur} min={0.4} max={1} step={0.05} onChange={(v) => set('backdropBlur', v)} />
              </Field>
              <Field label="Darken" value={times(style.backdropDim)}>
                <Slider value={style.backdropDim} min={0} max={1} step={0.05} onChange={(v) => set('backdropDim', v)} />
              </Field>
            </SettingSection>
          </>
        ) : (
          <SettingSection title="Regular" onReset={() => useLyricsStyle.getState().resetRegular()}>
            <Field label="Text size" value={times(style.regularSize)}>
              <Slider value={style.regularSize} min={0.75} max={1.4} step={0.05} onChange={(v) => set('regularSize', v)} />
            </Field>
            <Field label="Alignment">
              <Segmented
                value={style.regularAlign}
                onChange={(v) => set('regularAlign', v)}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Centre' },
                ]}
              />
            </Field>
            <Field label="Other lines" value={times(style.regularDim)} hint="How visible the lines around the current one are">
              <Slider value={style.regularDim} min={0.2} max={0.9} step={0.05} onChange={(v) => set('regularDim', v)} />
            </Field>
            <Field label="Current line">
              <Segmented
                value={style.regularColor}
                onChange={(v) => set('regularColor', v)}
                options={[
                  { value: 'white', label: 'White' },
                  { value: 'accent', label: 'Accent' },
                ]}
              />
            </Field>
          </SettingSection>
        )}
      </ScrollView>
    </View>
  );
}

/** Made-up lyrics on a loop, drawn exactly like the lyrics screen, over the playing album. */
function Preview({ mode }: { mode: LyricsMode }) {
  const t = useTheme();
  const client = useAuth((s) => s.client);
  const track = usePlayer((s) => s.queue[s.index]?.item);
  const [t0] = useState(() => Date.now());
  const clock = useMemo(() => ({ nowMs: () => (Date.now() - t0) % LOOP_MS, durationMs: () => LOOP_MS }), [t0]);
  return (
    <View style={{ height: PREVIEW_HEIGHT, marginTop: t.space.md, borderRadius: t.radius.card, overflow: 'hidden' }}>
      <LyricsStage
        lyrics={DEMO_LYRICS}
        loading={false}
        mode={mode}
        nowMs={clock.nowMs}
        durationMs={clock.durationMs}
        onSeek={() => {}}
        artUri={track ? client?.imageUrl(track, 600) : undefined}
        tint={artColor(track && client?.blurhash(track), '#6b2d1f')}
      />
    </View>
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
}));
