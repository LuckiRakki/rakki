import { Pressable, View } from 'react-native';

import { Ionicons } from '@/ui/Icon';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { useSettingsStyles } from '@/settings/screen/styles';

export interface NavRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
  keywords?: string;
}

/** A Settings row: an icon tile, the name, its current value and a chevron, joined into rounded groups. */
export function NavRow({ icon, label, value, onPress, danger, first, last }: NavRowProps & { first: boolean; last: boolean }) {
  const t = useTheme();
  const styles = useSettingsStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [
        styles.navRow,
        { borderTopLeftRadius: first ? 16 : 0, borderTopRightRadius: first ? 16 : 0, borderBottomLeftRadius: last ? 16 : 0, borderBottomRightRadius: last ? 16 : 0 },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={[styles.tile, danger && { backgroundColor: 'rgba(255,84,112,0.16)' }]}>
        <Ionicons name={icon} size={18} color={danger ? t.colors.danger : t.colors.text} />
      </View>
      <T style={{ flex: 1, fontFamily: t.fonts.semibold, fontSize: t.size(16), color: danger ? t.colors.danger : t.colors.text }}>{label}</T>
      {value ? <T style={{ fontFamily: t.fonts.medium, fontSize: t.size(15), color: t.colors.textSecondary, marginRight: 6 }}>{value}</T> : null}
      {danger ? null : <Ionicons name="chevron-forward" size={16} color={t.colors.textMuted} />}
      {last ? null : <View style={styles.rowLine} />}
    </Pressable>
  );
}
