import { Ionicons } from '@/ui/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemeError, type Theme } from '@/appearance/themeFormat';
import { BUILT_IN_THEMES, DEFAULT_THEME, fetchTheme, phoneColors, usePhoneThemes } from '@/appearance/themes';
import { tick } from '@/lib/haptics';
import { showToast } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const THEMES_HELP = 'https://github.com/LuckiRakki/rakki/blob/main/docs/THEMES.md';

/** Settings → Look → Theme: Rakki's own look, Kawarp, or a theme file (the same .css files as the desktop). */
export default function ThemesScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { active, imported, setActive, add, remove } = usePhoneThemes();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const addTheme = async () => {
    const input = text.trim();
    if (!input || busy) return;
    setBusy(true);
    try {
      const theme = add(/^https?:\/\//i.test(input) ? await fetchTheme(input) : input);
      setText('');
      showToast(`Using ${theme.meta.name}`);
    } catch (e) {
      showToast(e instanceof ThemeError ? e.message : "Couldn't add that theme.");
    } finally {
      setBusy(false);
    }
  };

  const row = (id: string, name: string, detail: string, theme?: Theme) => {
    const on = id === active;
    const c = theme ? phoneColors(theme) : null;
    return (
      <Pressable
        key={id}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        onPress={() => {
          tick();
          setActive(id);
        }}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
        <View style={[styles.swatch, { backgroundColor: c?.bg ?? '#121212', borderColor: c?.border ?? t.colors.border }]}>
          {/* A theme with a backdrop shows colour flowing behind its card. */}
          {c?.backdrop && c.backdrop !== 'none' ? (
            <LinearGradient colors={[t.colors.accent, '#5B3FD0', '#0B3B5E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={[styles.swatchCard, { backgroundColor: c?.surface ?? '#1e1e1e' }]} />
          <View style={[styles.swatchDot, { backgroundColor: t.colors.accent }]} />
        </View>
        <View style={{ flex: 1, marginHorizontal: t.space.md }}>
          <T variant="bodyStrong">{name}</T>
          <T variant="caption" numberOfLines={2} style={{ fontSize: t.size(12) }}>
            {detail}
          </T>
        </View>
        {theme && !theme.builtIn ? (
          <Pressable hitSlop={10} accessibilityLabel={`Remove ${name}`} onPress={() => remove(id)} style={{ marginRight: t.space.md }}>
            <Ionicons name="trash-outline" size={20} color={t.colors.textMuted} />
          </Pressable>
        ) : null}
        <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? t.colors.accent : t.colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.page }}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Theme</T>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: t.space.lg, paddingBottom: insets.bottom + t.space.xxl }}>
        <View style={styles.card}>
          {row(DEFAULT_THEME, 'Rakki', "Rakki's own look, set in Settings → Look.")}
          {BUILT_IN_THEMES.map((theme) => row(theme.id, theme.meta.name, theme.meta.description ?? '', theme))}
          {imported.map((theme) =>
            row(theme.id, theme.meta.name, [theme.meta.description, theme.meta.author ? `By ${theme.meta.author}` : null].filter(Boolean).join(' · ') || 'Added', theme),
          )}
        </View>

        <T variant="label" style={{ marginTop: t.space.xl, marginBottom: t.space.sm }}>
          Add a Theme
        </T>
        <View style={[styles.card, { paddingVertical: t.space.lg }]}>
          <T variant="caption" style={{ fontSize: t.size(12) }}>
            Paste a theme&apos;s CSS or a link to its .css file. The phone uses the colours it sets; the rest is for the desktop. Adding a theme with the same name again updates it.
          </T>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardAppearance="dark"
            placeholder={':root {\n  --bg: #0b0b0d;\n  --surface-2: #1d1d21;\n}'}
            placeholderTextColor={t.colors.textMuted}
            style={styles.input}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: t.space.md }}>
            <Pressable hitSlop={8} onPress={() => void openBrowserAsync(THEMES_HELP)} style={{ flex: 1 }}>
              <T variant="caption" color={t.colors.accent} style={{ fontFamily: t.fonts.semibold }}>
                How to Make One
              </T>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!text.trim() || busy}
              onPress={() => void addTheme()}
              style={({ pressed }) => [styles.add, (!text.trim() || busy) && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
              <T variant="bodyStrong" color="#000">
                {busy ? 'Adding' : 'Add'}
              </T>
            </Pressable>
          </View>
        </View>
      </ScrollView>
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
  card: { backgroundColor: t.colors.surface, borderRadius: t.radius.card, paddingHorizontal: t.space.lg },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: t.space.md },
  swatch: { width: 44, height: 44, borderRadius: t.radius.card, borderWidth: 1, padding: 6, overflow: 'hidden' },
  swatchCard: { flex: 1, borderRadius: 3 },
  swatchDot: { position: 'absolute', right: 5, bottom: 5, width: 10, height: 10, borderRadius: 5 },
  input: {
    minHeight: 120,
    maxHeight: 260,
    marginTop: t.space.md,
    padding: t.space.md,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface3,
    color: t.colors.text,
    fontFamily: 'Menlo',
    fontSize: t.size(13),
    textAlignVertical: 'top',
  },
  add: { height: 36, paddingHorizontal: t.space.lg, borderRadius: t.radius.pill, backgroundColor: t.colors.accent, alignItems: 'center', justifyContent: 'center' },
}));
