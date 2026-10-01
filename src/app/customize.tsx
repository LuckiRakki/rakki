import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
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
import { isHexColor } from '@/lib/color';
import { tick } from '@/lib/haptics';
import { AppIconPicker } from '@/ui/AppIconPicker';
import { Segmented } from '@/ui/Segmented';
import { Field, SettingSection, Toggle } from '@/ui/SettingRows';
import { Slider } from '@/ui/Slider';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** A sample album colour for the preview (shows how art tints the UI). */
const SAMPLE_ART = '#6E44C9';

function set<K extends keyof Appearance>(key: K, value: Appearance[K]) {
  useAppearance.getState().set(key, value);
}

/** Settings → Customize: every look-and-feel choice, applied live. */
export default function CustomizeScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const a = t.appearance;
  const custom = useAppearance((s) => s.accent);
  const [hex, setHex] = useState(custom);

  const resetAll = () =>
    Alert.alert('Reset everything?', 'All of Customize goes back to how Rakki looks out of the box.', [
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
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Customize</T>
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
                { value: 'oled', label: 'OLED black' },
                { value: 'tinted', label: 'Tinted' },
              ]}
            />
          </Field>
          <Field label="Card contrast" value={`${Math.round(a.surfaceContrast * 100)}%`}>
            <Slider value={a.surfaceContrast} min={0.5} max={2} step={0.1} onChange={(v) => set('surfaceContrast', v)} />
          </Field>
          <Field label="Album colour in headers and player" value={`${Math.round(a.artTint * 100)}%`}>
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
              {a.font === k ? <Ionicons name="checkmark" size={22} color={t.colors.accent} /> : null}
            </Pressable>
          ))}
          <Field label="Text size" value={`${Math.round(a.textScale * 100)}%`}>
            <Slider value={a.textScale} min={0.85} max={1.4} step={0.05} onChange={(v) => set('textScale', v)} />
          </Field>
          <Field label="Big titles">
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
          <Field label="Corner roundness" value={a.roundness === 0 ? 'Square' : `${Math.round(a.roundness * 100)}%`}>
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
          <Field label="Album grid columns">
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
          <Toggle label="Quick picks" detail="Liked Songs and recent albums as tiles" value={a.quickPicks} onChange={(v) => set('quickPicks', v)} />
          <T variant="caption" style={[styles.hint, { marginTop: t.space.md }]}>
            Shelves, top to bottom. Tap the eye to show or hide one.
          </T>
          <ShelfEditor />
        </Section>

        <Section title="Mini-player and tab bar" id="mini">
          <Field label="Mini-player">
            <Segmented
              value={a.miniPlayer}
              onChange={(v) => set('miniPlayer', v)}
              options={[
                { value: 'tinted', label: 'Album colour' },
                { value: 'solid', label: 'Solid' },
                { value: 'glass', label: 'Glass' },
              ]}
            />
          </Field>
          <Toggle label="Progress line" value={a.miniProgress} onChange={(v) => set('miniProgress', v)} />
          <Toggle label="Tab labels" detail="Home, Search, Your Library under the icons" value={a.tabLabels} onChange={(v) => set('tabLabels', v)} />
        </Section>

        <Section title="Now playing" id="player">
          <Field label="Background">
            <Segmented
              value={a.playerBackground}
              onChange={(v) => set('playerBackground', v)}
              options={[
                { value: 'gradient', label: 'Gradient' },
                { value: 'blur', label: 'Blurred art' },
                { value: 'solid', label: 'Solid' },
              ]}
            />
          </Field>
          <Toggle label="Lyrics card" detail="Below the controls; scroll down to see it" value={a.lyricsCard} onChange={(v) => set('lyricsCard', v)} />
        </Section>

        <Pressable onPress={() => router.push('/lyrics-style')} style={({ pressed }) => [styles.card, styles.linkRow, { marginTop: t.space.xl }, pressed && { opacity: 0.7 }]}>
          <Ionicons name="mic-outline" size={22} color={t.colors.accent} />
          <View style={{ flex: 1, marginHorizontal: t.space.md }}>
            <T variant="bodyStrong">Lyrics style</T>
            <T variant="caption" style={{ fontSize: t.size(12) }}>
              Spicy glow, motion, size, colours and background; Regular lyrics
            </T>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.colors.textMuted} />
        </Pressable>

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
