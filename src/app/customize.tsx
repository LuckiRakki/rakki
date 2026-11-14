import { Ionicons } from '@/ui/Icon';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONTS, type FontKey } from '@/appearance/fonts';
import { PRESETS, presetValues, sectionDefaults, SWATCHES, type SectionId } from '@/appearance/presets';
import {
  currentAppearance,
  normalizeAppearance,
  SHELVES,
  useAppearance,
  type Appearance,
  type ShelfId,
} from '@/appearance/store';
import { findTheme, usePhoneThemes } from '@/appearance/themes';
import { DESKTOP_LINE, presetOf, VISUALIZER_PRESETS, type VisualizerLook } from '@/appearance/visualizer';
import { isHexColor } from '@/lib/color';
import { tick } from '@/lib/haptics';
import { AppIconPicker } from '@/ui/AppIconPicker';
import { Segmented } from '@/ui/Segmented';
import { Field, SettingSection, Toggle } from '@/ui/SettingRows';
import { Slider } from '@/ui/Slider';
import { SoundGraph } from '@/ui/SoundGraph';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** A sample album colour for the preview (shows how art tints the UI). */
const SAMPLE_ART = '#6E44C9';

function set<K extends keyof Appearance>(key: K, value: Appearance[K]) {
  useAppearance.getState().set(key, value);
}

/** Settings → Look (was Customize): every look-and-feel choice, applied live. Glass comes first in 2.0. */
export default function CustomizeScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const a = t.appearance;
  const custom = useAppearance((s) => s.accent);
  const [hex, setHex] = useState(custom);
  const themeName = usePhoneThemes((s) => findTheme(s.active, s.imported)?.meta.name ?? 'Rakki');

  const resetAll = () =>
    Alert.alert('Reset Everything?', 'All of Look goes back to how Rakki looks out of the box.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          useAppearance.getState().reset();
          setHex(useAppearance.getState().accent);
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.page }}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Look</T>
        <Pressable hitSlop={10} onPress={resetAll}>
          <T variant="bodyStrong" color={t.colors.textSecondary}>
            Reset
          </T>
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: t.space.lg, paddingBottom: insets.bottom + t.space.xxl }}>
        <Preview />

        <T variant="label" style={styles.label}>
          Glass
        </T>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space.sm }}>
          {(['frost', 'clear', 'tint'] as const).map((g) => (
            <GlassPick key={g} kind={g} selected={a.glass === g} onPress={() => set('glass', g)} />
          ))}
        </View>
        <T variant="caption" style={styles.hint}>
          Frost is smoked glass, Clear drops the panels for a dark fade, Tint colours the glass with the album.
        </T>

        <T variant="label" style={styles.label}>
          Presets
        </T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space.sm }}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                tick();
                useAppearance.getState().apply(presetValues(p.id));
                setHex(useAppearance.getState().accent);
              }}
              style={({ pressed }) => [styles.preset, pressed && { opacity: 0.7 }]}>
              <View style={[styles.presetSwatch, { backgroundColor: p.swatch }]} />
              <T variant="bodyStrong" style={{ fontSize: t.size(13) }}>
                {p.label}
              </T>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable onPress={() => router.push('/themes')} style={({ pressed }) => [styles.card, styles.linkRow, { marginTop: t.space.xl, paddingBottom: t.space.lg }, pressed && { opacity: 0.7 }]}>
          <Ionicons name="color-palette-outline" size={22} color={t.colors.accent} />
          <View style={{ flex: 1, marginHorizontal: t.space.md }}>
            <T variant="bodyStrong">Theme</T>
            <T variant="caption" style={{ fontSize: t.size(12) }}>
              {themeName}
            </T>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.colors.textMuted} />
        </Pressable>

        <AppIconPicker />

        <Section title="Colour" id="colour" onReset={() => setHex(useAppearance.getState().accent)}>
          <Field label="Accent">
            <Segmented
              value={a.accentMode}
              onChange={(v) => set('accentMode', v)}
              options={[
                { value: 'custom', label: 'Custom' },
                { value: 'lucid', label: 'Lucid' },
              ]}
            />
            <T variant="caption" style={styles.hint}>
              {a.accentMode === 'lucid'
                ? 'Takes its colour from the album that’s playing (or the last one). Your Custom colour is the fallback.'
                : 'Your own colour, everywhere.'}
            </T>
          </Field>
          <View style={styles.swatches}>
            {SWATCHES.map((c) => (
              <Pressable
                key={c}
                accessibilityLabel={`Accent ${c}`}
                onPress={() => {
                  tick();
                  set('accent', c);
                  setHex(c);
                }}
                style={[styles.swatch, { backgroundColor: c }, custom.toLowerCase() === c.toLowerCase() && styles.swatchOn]}
              />
            ))}
          </View>
          <View style={styles.hexRow}>
            <View style={[styles.hexDot, { backgroundColor: isHexColor(hex) ? hex : custom }]} />
            <TextInput
              value={hex}
              onChangeText={(v) => {
                setHex(v);
                const value = v.startsWith('#') ? v : `#${v}`;
                if (isHexColor(value) && value.length === 7) set('accent', value);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={7}
              placeholder="#FF6B3D"
              placeholderTextColor={t.colors.textMuted}
              keyboardAppearance="dark"
              style={styles.hexInput}
            />
            <T variant="caption">Any colour as #RRGGBB</T>
          </View>
          <Field label="Background">
            <Segmented
              value={a.background}
              onChange={(v) => set('background', v)}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'oled', label: 'OLED Black' },
                { value: 'tinted', label: 'Tinted' },
              ]}
            />
          </Field>
          <Field label="Card Contrast" value={`${Math.round(a.surfaceContrast * 100)}%`}>
            <Slider value={a.surfaceContrast} min={0.5} max={2} step={0.1} onChange={(v) => set('surfaceContrast', v)} />
          </Field>
          <Field label="Album Colour in Headers and Player" value={`${Math.round(a.artTint * 100)}%`}>
            <Slider value={a.artTint} min={0} max={1} step={0.05} onChange={(v) => set('artTint', v)} />
          </Field>
        </Section>

        <Section title="Text" id="type">
          {(Object.keys(FONTS) as FontKey[]).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                tick();
                set('font', k);
              }}
              style={styles.fontRow}>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: FONTS[k].faces.bold, fontSize: t.size(17), color: t.colors.text }}>{FONTS[k].label}</T>
                <T variant="caption" style={{ fontFamily: FONTS[k].faces.regular }}>
                  {FONTS[k].note}
                </T>
              </View>
              {a.font === k ? <Ionicons name="checkmark" size={22} color={t.colors.accentText} /> : null}
            </Pressable>
          ))}
          <Field label="Text Size" value={`${Math.round(a.textScale * 100)}%`}>
            <Slider value={a.textScale} min={0.85} max={1.4} step={0.05} onChange={(v) => set('textScale', v)} />
          </Field>
          <Field label="Big Titles">
            <Segmented
              value={a.titleWeight}
              onChange={(v) => set('titleWeight', v)}
              options={[
                { value: 'heavy', label: 'Heavy' },
                { value: 'bold', label: 'Bold' },
              ]}
            />
          </Field>
        </Section>

        <Section title="Shape" id="shape">
          <Field label="Corner Roundness" value={a.roundness === 0 ? 'Square' : `${Math.round(a.roundness * 100)}%`}>
            <Slider value={a.roundness} min={0} max={2} step={0.1} onChange={(v) => set('roundness', v)} />
          </Field>
          <Field label="Spacing">
            <Segmented
              value={a.density}
              onChange={(v) => set('density', v)}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'spacious', label: 'Spacious' },
              ]}
            />
          </Field>
          <Field label="Album Grid Columns">
            <Segmented
              value={a.gridColumns}
              onChange={(v) => set('gridColumns', v)}
              options={[
                { value: 2, label: '2' },
                { value: 3, label: '3' },
                { value: 4, label: '4' },
              ]}
            />
          </Field>
        </Section>

        <Section title="Home" id="home">
          <Toggle label="Greeting" detail="“Good evening” at the top" value={a.greeting} onChange={(v) => set('greeting', v)} />
          <Toggle label="Quick Picks" detail="Liked Songs and recent albums as tiles" value={a.quickPicks} onChange={(v) => set('quickPicks', v)} />
          <T variant="caption" style={[styles.hint, { marginTop: t.space.md }]}>
            Shelves, top to bottom. Tap the eye to show or hide one.
          </T>
          <ShelfEditor />
        </Section>

        <Section title="Mini Player and Tab Bar" id="mini">
          <Field label="Mini Player">
            <Segmented
              value={a.miniPlayer}
              onChange={(v) => set('miniPlayer', v)}
              options={[
                { value: 'tinted', label: 'Album Colour' },
                { value: 'solid', label: 'Solid' },
                { value: 'glass', label: 'Glass' },
              ]}
            />
          </Field>
          <Toggle label="Progress Line" value={a.miniProgress} onChange={(v) => set('miniProgress', v)} />
          <Toggle
            label="Visualizer"
            detail="Little bars by the song while it plays"
            value={a.miniVisualizer}
            onChange={(v) => set('miniVisualizer', v)}
          />
          <Toggle label="Tab Labels" detail="Home, Search, Your Library under the icons" value={a.tabLabels} onChange={(v) => set('tabLabels', v)} />
        </Section>

        <Section title="Now Playing" id="player">
          <Field label="Background">
            <Segmented
              value={a.playerBackground}
              onChange={(v) => set('playerBackground', v)}
              options={[
                { value: 'moving', label: 'Moving' },
                { value: 'gradient', label: 'Gradient' },
                { value: 'blur', label: 'Blurred' },
                { value: 'solid', label: 'Solid' },
              ]}
            />
          </Field>
          <Field label="Movement (Also Music Videos)" value={a.playerMotion === 0 ? 'Still' : `${a.playerMotion.toFixed(1)}×`}>
            <Slider value={a.playerMotion} min={0} max={2.5} step={0.1} onChange={(v) => set('playerMotion', v)} />
          </Field>
          <Toggle label="Lyrics Card" detail="Below the controls; scroll down to see it" value={a.lyricsCard} onChange={(v) => set('lyricsCard', v)} />
          <Toggle
            label="Turn for Full Screen"
            detail="Hold the phone sideways in the player for the lyrics, or the visualizer, across the whole screen"
            value={a.turnFullScreen}
            onChange={(v) => set('turnFullScreen', v)}
          />
          <Field label="Pause Button">
            <Segmented
              value={a.pauseStyle}
              onChange={(v) => set('pauseStyle', v)}
              options={[
                { value: 'circle', label: 'Accent Circle' },
                { value: 'plain', label: 'Plain' },
              ]}
            />
          </Field>
        </Section>

        <Pressable onPress={() => router.push('/lyrics-style')} style={({ pressed }) => [styles.card, styles.linkRow, { marginTop: t.space.xl }, pressed && { opacity: 0.7 }]}>
          <Ionicons name="mic-outline" size={22} color={t.colors.accent} />
          <View style={{ flex: 1, marginHorizontal: t.space.md }}>
            <T variant="bodyStrong">Lyrics Style</T>
            <T variant="caption" style={{ fontSize: t.size(12) }}>
              Spicy glow, motion, size, colours and background; Regular lyrics
            </T>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.colors.textMuted} />
        </Pressable>

        <VisualizerSection />

        <Section title="Feel" id="feel">
          <Toggle label="Haptics" detail="Light taps on buttons and menus" value={a.haptics} onChange={(v) => set('haptics', v)} />
          <Field label="Motion">
            <Segmented
              value={a.motion}
              onChange={(v) => set('motion', v)}
              options={[
                { value: 'system', label: 'Follow iOS' },
                { value: 'reduced', label: 'Reduced' },
                { value: 'full', label: 'Full' },
              ]}
            />
          </Field>
        </Section>

        <T variant="label" style={styles.label}>
          Share
        </T>
        <View style={styles.card}>
          <T variant="caption">Save your look as text to back it up or send it to someone, or load one.</T>
          <View style={{ flexDirection: 'row', gap: t.space.sm, marginTop: t.space.md }}>
            <Pressable onPress={() => void exportTheme()} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
              <Ionicons name="share-outline" size={18} color={t.colors.text} />
              <T variant="bodyStrong">Export</T>
            </Pressable>
            <Pressable
              onPress={() => importTheme(() => setHex(useAppearance.getState().accent))}
              style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
              <Ionicons name="download-outline" size={18} color={t.colors.text} />
              <T variant="bodyStrong">Import</T>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

async function exportTheme() {
  const json = JSON.stringify({ rakkiTheme: 1, ...currentAppearance() });
  await Share.share({ message: json });
}

function applyImported(text: string | undefined, done: () => void) {
  if (!text) return;
  try {
    const parsed = JSON.parse(text) as Partial<Appearance> & { rakkiTheme?: number };
    if (parsed.rakkiTheme !== 1) throw new Error('not a theme');
    useAppearance.getState().apply(normalizeAppearance(parsed));
    done();
  } catch {
    Alert.alert('That isn’t a Rakki theme', 'Paste the whole text you got from Export.');
  }
}

function importTheme(done: () => void) {
  if (Platform.OS === 'ios') {
    Alert.prompt('Import a theme', 'Paste the text from Export.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Import', onPress: (text?: string) => applyImported(text, done) },
    ]);
  } else {
    applyImported(globalThis.prompt?.('Paste the text from Export') ?? undefined, done);
  }
}

function Section({ title, id, onReset, children }: { title: string; id: SectionId; onReset?: () => void; children: ReactNode }) {
  return (
    <SettingSection
      title={title}
      onReset={() => {
        useAppearance.getState().apply(sectionDefaults(id));
        onReset?.();
      }}>
      {children}
    </SettingSection>
  );
}

function setLook(patch: Partial<VisualizerLook>) {
  set('visualizer', { ...useAppearance.getState().visualizer, ...patch });
}

/**
 * Look → Visualizer: a live preview, the desktop's four looks and its colours, the player's card for
 * songs without lyrics, then the finer settings (as on the desktop's Settings → Visualizer).
 */
function VisualizerSection() {
  const t = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const a = t.appearance;
  const look = a.visualizer;
  const preset = presetOf(look);
  const line = look.style === 'line';
  const [more, setMore] = useState(false);
  return (
    <Section title="Visualizer" id="visualizer">
      <View style={styles.vizPreview}>
        <SoundGraph width={width - t.space.lg * 4} height={120} demo />
      </View>
      <T variant="caption" style={styles.hint}>
        Plays along with whatever Rakki plays. Shown on the lyrics screen, sideways in the player, and for songs without lyrics.
      </T>
      <Field label="Look">
        <Segmented
          value={preset ?? 'custom'}
          onChange={(id) => {
            const p = VISUALIZER_PRESETS.find((x) => x.id === id);
            if (p) set('visualizer', p.look);
          }}
          options={[...VISUALIZER_PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(preset ? [] : [{ value: 'custom', label: 'Yours' }])]}
        />
      </Field>
      <Field label="Colours" hint={look.colors === 'accent' ? 'Accent follows the colour of what’s playing.' : undefined}>
        <Segmented
          value={look.colors}
          onChange={(colors) => setLook({ colors })}
          options={[
            { value: 'mono', label: 'White' },
            { value: 'accent', label: 'Accent' },
            { value: 'prism', label: 'Prism' },
            { value: 'rainbow', label: 'Rainbow' },
          ]}
        />
      </Field>
      <Toggle
        label="When a Song Has No Lyrics"
        detail="The visualizer in the player where the lyrics card would be; tap it for the full visualizer"
        value={a.noLyricsVisualizer}
        onChange={(v) => set('noLyricsVisualizer', v)}
      />
      <Pressable onPress={() => setMore(!more)} hitSlop={6} style={styles.moreRow} accessibilityState={{ expanded: more }}>
        <T variant="bodyStrong">More Options</T>
        <Ionicons name={more ? 'chevron-up' : 'chevron-down'} size={18} color={t.colors.textMuted} />
      </Pressable>
      {more ? (
        <>
          <Field label="Drawn As">
            <Segmented
              value={look.style}
              onChange={(style) => setLook({ style })}
              options={[
                { value: 'line', label: 'Line' },
                { value: 'bars', label: 'Bars' },
              ]}
            />
          </Field>
          {line ? (
            <Field label="Line Width" value={look.lineWidth.toFixed(1)}>
              <Slider value={look.lineWidth} min={0.5} max={4} step={0.1} onChange={(lineWidth) => setLook({ lineWidth })} />
            </Field>
          ) : (
            <Field label="Bars">
              <Segmented<VisualizerLook['bars']>
                value={look.bars}
                onChange={(bars) => setLook({ bars })}
                options={[
                  { value: 12, label: 'Few' },
                  { value: 20, label: 'Some' },
                  { value: 32, label: 'Many' },
                ]}
              />
            </Field>
          )}
          <Field label={line ? 'Fill Under the Line' : 'Bar Opacity'} value={`${Math.round(look.fill * 100)}%`}>
            <Slider value={look.fill} min={0} max={1} step={0.05} onChange={(fill) => setLook({ fill })} />
          </Field>
          <Field label="Reflection" hint="A faint mirror under it.">
            <Segmented<number>
              value={look.reflection}
              onChange={(reflection) => setLook({ reflection })}
              options={[
                { value: 0, label: 'Off' },
                { value: 0.25, label: 'Short' },
                { value: 0.5, label: 'Half' },
                ...([0, 0.25, 0.5].includes(look.reflection) ? [] : [{ value: look.reflection, label: 'Yours' }]),
              ]}
            />
          </Field>
          <Field label="Smoothing" value={`${Math.round(look.smoothing * 100)}%`} hint="Higher: calmer movement.">
            <Slider value={look.smoothing} min={0} max={0.9} step={0.05} onChange={(smoothing) => setLook({ smoothing })} />
          </Field>
          <Toggle label="Peaks" detail="Marks that hold the highest points for a moment" value={look.peaks} onChange={(peaks) => setLook({ peaks })} />
          {preset !== 'line' ? (
            <Pressable onPress={() => set('visualizer', DESKTOP_LINE)} style={({ pressed }) => [styles.button, { marginTop: t.space.lg, alignSelf: 'flex-start' }, pressed && { opacity: 0.7 }]}>
              <T variant="bodyStrong">Back to the Desktop Look</T>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

/** Home's shelves: show/hide (eye) and move up/down. */
function ShelfEditor() {
  const t = useTheme();
  const order = useAppearance((s) => s.homeOrder);
  const hidden = useAppearance((s) => s.homeHidden);
  const label = (id: ShelfId) => SHELVES.find((s) => s.id === id)?.label ?? id;
  const move = (i: number, by: number) => {
    const next = [...order];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    tick();
    set('homeOrder', next);
  };
  const toggle = (id: ShelfId) => {
    tick();
    set('homeHidden', hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);
  };
  return (
    <View style={{ marginTop: t.space.sm }}>
      {order.map((id, i) => {
        const off = hidden.includes(id);
        return (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: t.space.xs }}>
            <Pressable hitSlop={8} onPress={() => toggle(id)} accessibilityLabel={off ? `Show ${label(id)}` : `Hide ${label(id)}`}>
              <Ionicons name={off ? 'eye-off-outline' : 'eye-outline'} size={22} color={off ? t.colors.textMuted : t.colors.accent} />
            </Pressable>
            <T variant="body" style={{ flex: 1, marginLeft: t.space.md, color: off ? t.colors.textMuted : t.colors.text }}>
              {label(id)}
            </T>
            <Pressable hitSlop={6} disabled={i === 0} onPress={() => move(i, -1)} accessibilityLabel={`Move ${label(id)} up`}>
              <Ionicons name="chevron-up" size={22} color={i === 0 ? t.colors.surface3 : t.colors.textSecondary} />
            </Pressable>
            <Pressable
              hitSlop={6}
              disabled={i === order.length - 1}
              onPress={() => move(i, 1)}
              accessibilityLabel={`Move ${label(id)} down`}
              style={{ marginLeft: t.space.md }}>
              <Ionicons name="chevron-down" size={22} color={i === order.length - 1 ? t.colors.surface3 : t.colors.textSecondary} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** A small live sample: title, a song row, chips, and the mini-player in the chosen style. */
function Preview() {
  const t = useTheme();
  const styles = useStyles();
  const a = t.appearance;
  const miniBg = a.miniPlayer === 'tinted' ? t.tint(SAMPLE_ART) : a.miniPlayer === 'solid' ? t.colors.surface2 : 'transparent';
  return (
    <View style={[styles.preview, { backgroundColor: t.colors.bg, borderColor: t.colors.border }]}>
      <LinearGradient colors={[t.tint(SAMPLE_ART), t.colors.bg]} style={StyleSheet.absoluteFill} />
      <T variant="display" style={{ fontSize: t.size(24) }}>
        Good evening
      </T>
      <View style={{ flexDirection: 'row', gap: t.space.sm, marginTop: t.space.md }}>
        <View style={[styles.chip, { backgroundColor: t.colors.accent }]}>
          <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(12), color: '#000' }}>Playlists</T>
        </View>
        <View style={[styles.chip, { backgroundColor: t.colors.surface2 }]}>
          <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(12), color: t.colors.text }}>Albums</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: t.space.md }}>
        <LinearGradient colors={[SAMPLE_ART, '#E05297']} style={{ width: 44, height: 44, borderRadius: t.radius.art }} />
        <View style={{ flex: 1, marginLeft: t.space.md }}>
          <T variant="bodyStrong" color={t.colors.accent}>
            Song title
          </T>
          <T variant="caption">Artist name</T>
        </View>
        <Ionicons name="heart" size={16} color={t.colors.accent} />
      </View>
      <View style={[styles.mini, { backgroundColor: miniBg, borderRadius: t.radius.card }]}>
        {a.miniPlayer === 'glass' ? (
          <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(40,40,40,0.35)' }]} />
        ) : null}
        <LinearGradient colors={[SAMPLE_ART, '#E05297']} style={{ width: 32, height: 32, borderRadius: t.radius.art }} />
        <T numberOfLines={1} style={{ flex: 1, marginLeft: t.space.sm, fontFamily: t.fonts.semibold, fontSize: t.size(12) }}>
          Song title
        </T>
        <Ionicons name="pause" size={20} color={t.colors.text} />
        {a.miniProgress ? (
          <View style={styles.miniTrack}>
            <View style={{ width: '40%', height: 2, backgroundColor: t.colors.text }} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** A small preview of one glass level: the album's colours with a control bar on them. */
function GlassPick({ kind, selected, onPress }: { kind: Appearance['glass']; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  const label = { frost: 'Frost', clear: 'Clear', tint: 'Tint' }[kind];
  const deep = '#0E2E38';
  const bar =
    kind === 'frost'
      ? { backgroundColor: 'rgba(18,18,22,0.42)', borderColor: 'rgba(255,255,255,0.14)', borderWidth: StyleSheet.hairlineWidth }
      : kind === 'tint'
        ? { backgroundColor: 'rgba(14,46,56,0.62)', borderColor: 'rgba(255,255,255,0.16)', borderWidth: StyleSheet.hairlineWidth }
        : null;
  return (
    <Pressable onPress={() => { tick(); onPress(); }} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Glass: ${label}`} style={{ flex: 1, gap: 8 }}>
      <View style={{ height: 76, borderRadius: 14, overflow: 'hidden', borderWidth: selected ? 2 : StyleSheet.hairlineWidth, borderColor: selected ? '#FFFFFF' : 'rgba(255,255,255,0.12)' }}>
        <LinearGradient colors={[SAMPLE_ART, deep, '#F2A65A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {kind === 'clear' ? <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']} style={[StyleSheet.absoluteFill, { top: '40%' }]} /> : null}
        <View style={[{ position: 'absolute', left: 8, right: 8, bottom: 8, height: 26, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, overflow: 'hidden' }, bar]}>
          {kind === 'clear' ? null : <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />}
          <Ionicons name="play-skip-back" size={13} color="#fff" />
          <Ionicons name="pause" size={15} color="#fff" />
          <Ionicons name="play-skip-forward" size={13} color="#fff" />
        </View>
        {selected ? (
          <View style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={14} color={t.colors.bg} />
          </View>
        ) : null}
      </View>
      <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(14) }}>{label}</T>
    </Pressable>
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
  label: { marginTop: t.space.xl, marginBottom: t.space.sm },
  card: { backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.space.lg, paddingTop: t.space.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingTop: t.space.lg },
  hint: { marginTop: t.space.sm, fontSize: t.size(12) },
  vizPreview: { marginTop: t.space.md, height: 120, borderRadius: t.radius.card - 4, backgroundColor: 'rgba(0,0,0,0.35)', overflow: 'hidden', alignItems: 'center' },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: t.space.lg },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    paddingHorizontal: t.space.md,
    height: 40,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surface2,
  },
  presetSwatch: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: t.space.md },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchOn: { borderWidth: 3, borderColor: t.colors.text },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, marginTop: t.space.md },
  hexDot: { width: 22, height: 22, borderRadius: 11 },
  hexInput: {
    width: 96,
    height: 36,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface3,
    color: t.colors.text,
    fontFamily: t.fonts.medium,
    fontSize: t.size(15),
  },
  fontRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: t.space.sm, marginTop: t.space.xs },
  button: {
    flex: 1,
    flexDirection: 'row',
    gap: t.space.sm,
    height: 42,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { borderRadius: t.radius.card, padding: t.space.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  chip: { paddingHorizontal: t.space.md, height: 28, justifyContent: 'center', borderRadius: t.radius.pill },
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: t.space.lg,
    height: 48,
    paddingHorizontal: t.space.sm,
    overflow: 'hidden',
  },
  miniTrack: { position: 'absolute', left: t.space.sm, right: t.space.sm, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
}));
