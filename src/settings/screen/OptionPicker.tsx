import { Pressable, View } from 'react-native';

import { Ionicons } from '@/ui/Icon';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { useSettingsStyles } from '@/settings/screen/styles';

export function OptionPicker<V extends string | number>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { value: V; label: string; detail: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const t = useTheme();
  const styles = useSettingsStyles();
  return (
    <>
      <T style={styles.sectionTitle}>{title}</T>
      <View style={[styles.card, { paddingVertical: t.space.xs }]}>
        {options.map((o) => (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={styles.option}>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong" color={o.value === value ? t.colors.accentText : t.colors.text}>
                {o.label}
              </T>
              <T variant="caption" style={{ fontSize: t.size(12) }}>
                {o.detail}
              </T>
            </View>
            {o.value === value ? <Ionicons name="checkmark" size={20} color={t.colors.accentText} /> : null}
          </Pressable>
        ))}
      </View>
    </>
  );
}
