import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { APP_ICONS, appIconsAvailable, getAppIcon, setAppIcon, type AppIconName } from '@/lib/appIcon';
import { tick } from '@/lib/haptics';
import { SettingSection } from '@/ui/SettingRows';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { showToast } from '@/ui/overlays';

/** Customize → App icon: pick the Home Screen icon. Hidden where icons can't be switched. */
export function AppIconPicker() {
  const t = useTheme();
  const styles = useStyles();
  const [current, setCurrent] = useState<AppIconName>(null);

  useEffect(() => {
    void getAppIcon().then(setCurrent);
  }, []);

  if (!appIconsAvailable) return null;

  const choose = async (name: AppIconName) => {
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

  return (
    <SettingSection title="App icon">
      <View style={styles.row}>
        {APP_ICONS.map((icon) => {
          const on = icon.name === current;
          return (
            <Pressable
              key={icon.label}
              onPress={() => void choose(icon.name)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${icon.label} icon`}
              style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
              <View style={[styles.ring, on && { borderColor: t.colors.accent }]}>
                <Image source={icon.preview} style={styles.icon} />
                {on ? (
                  <View style={[styles.check, { backgroundColor: t.colors.accent }]}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </View>
                ) : null}
              </View>
              <T variant="caption" style={on ? { color: t.colors.text, fontFamily: t.fonts.semibold } : undefined}>
                {icon.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </SettingSection>
  );
}

const ICON = 64;

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', justifyContent: 'space-around', marginTop: t.space.md },
  tile: { alignItems: 'center', gap: t.space.sm },
  ring: { padding: 3, borderRadius: ICON * 0.225 + 5, borderWidth: 2, borderColor: 'transparent' },
  icon: { width: ICON, height: ICON, borderRadius: ICON * 0.225 },
  check: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.colors.surface,
  },
}));
