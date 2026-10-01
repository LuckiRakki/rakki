import { Pressable, View } from 'react-native';

import { tick } from '@/lib/haptics';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/** A row of choices in a pill, the chosen one filled (Customize). */
export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.colors.surface3, borderRadius: t.radius.pill, padding: 3 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              tick();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              height: 32,
              borderRadius: t.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? t.colors.text : 'transparent',
            }}>
            <T
              numberOfLines={1}
              style={{ fontFamily: t.fonts.semibold, fontSize: t.size(13), color: active ? '#000' : t.colors.textSecondary }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
