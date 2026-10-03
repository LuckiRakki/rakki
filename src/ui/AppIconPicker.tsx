import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, View, type ImageSourcePropType } from 'react-native';

import {
  appIconsAvailable,
  EXTRA_ICONS,
  getAppIcon,
  ICON_STYLES,
  iconName,
  iconPreview,
  PALETTES,
  parseIconName,
  setAppIcon,
  type IconStyle,
} from '@/lib/appIcon';
import { tick } from '@/lib/haptics';
import { Segmented } from '@/ui/Segmented';
import { SettingSection } from '@/ui/SettingRows';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { showToast } from '@/ui/overlays';

/**
 * Customize → App icon: a style (Liquid Glass, Depth or Flat) and a colour, or one of the extra
 * designs. Hidden where icons can't be switched (builds before 0.2.0).
 */
export function AppIconPicker() {
  const t = useTheme();
  const styles = useStyles();
  const [current, setCurrent] = useState<string | null>(null);
  const [style, setStyle] = useState<IconStyle>('Glass');

  useEffect(() => {
    void getAppIcon().then((name) => {
      setCurrent(name);
      const parsed = parseIconName(name);
      if ('style' in parsed) setStyle(parsed.style);
    });
  }, []);

  if (!appIconsAvailable) return null;

  const choose = async (name: string | null) => {
    if (name === current) return;
    tick();
    const previous = current;
    setCurrent(name);
    try {
      await setAppIcon(name);
    } catch {
      setCurrent(previous);
      showToast('Couldn’t change the icon');
    }
  };

  // Switching style keeps the colour (an extra design stays as it is until a colour is picked).
  const chooseStyle = (next: IconStyle) => {
    setStyle(next);
    const parsed = parseIconName(current);
    if ('palette' in parsed) void choose(iconName(parsed.palette, next));
  };

  const tile = (key: string, name: string | null, label: string, preview: ImageSourcePropType) => {
    const on = name === current;
    return (
      <Pressable
        key={key}
        onPress={() => void choose(name)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${label} icon`}
        style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
        <View style={[styles.ring, on && { borderColor: t.colors.accent }]}>
          <Image source={preview} style={styles.icon} />
          {on ? (
            <View style={[styles.check, { backgroundColor: t.colors.accent }]}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          ) : null}
        </View>
        <T variant="caption" numberOfLines={1} style={[styles.label, on && { color: t.colors.text, fontFamily: t.fonts.semibold }]}>
          {label}
        </T>
      </Pressable>
    );
  };

  return (
    <SettingSection title="App icon">
      <View style={{ marginTop: t.space.md }}>
        <Segmented options={ICON_STYLES.map((s) => ({ value: s.key, label: s.label }))} value={style} onChange={chooseStyle} />
      </View>
      <T variant="caption" style={{ marginTop: t.space.sm, fontSize: t.size(12) }}>
        {style === 'Glass'
          ? 'iOS 26’s layered glass look, with its own Dark, Clear and Tinted versions.'
          : style === 'Depth'
            ? 'Flat, with a shadow behind the cat.'
            : 'Flat and simple.'}
      </T>
      <View style={styles.grid}>
        {PALETTES.map((palette) => tile(palette, iconName(palette, style), palette, iconPreview(palette, style)))}
      </View>
      <T variant="label" style={{ marginTop: t.space.lg, color: t.colors.textSecondary }}>
        More designs
      </T>
      <View style={styles.grid}>{EXTRA_ICONS.map((e) => tile(e.name, e.name, e.label, e.preview))}</View>
    </SettingSection>
  );
}

const ICON = 56;

const useStyles = makeStyles((t) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md, marginTop: t.space.md },
  tile: { alignItems: 'center', gap: 4, width: ICON + 12 },
  ring: { padding: 3, borderRadius: ICON * 0.225 + 5, borderWidth: 2, borderColor: 'transparent' },
  icon: { width: ICON, height: ICON, borderRadius: ICON * 0.225 },
  label: { fontSize: t.size(11) },
  check: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.colors.surface,
  },
}));
