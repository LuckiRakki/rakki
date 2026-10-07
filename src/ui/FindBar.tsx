import { Ionicons } from '@expo/vector-icons';
import { Pressable, TextInput, View } from 'react-native';

import { makeStyles, useTheme } from '@/ui/theme';

/** "Find in playlist": a search field that narrows down the songs on the page. */
export function FindBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.bar}>
      <Ionicons name="search" size={16} color={t.colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.colors.textMuted}
        autoCorrect={false}
        returnKeyType="search"
        style={styles.input}
      />
      {value ? (
        <Pressable hitSlop={8} onPress={() => onChange('')} accessibilityLabel="Clear">
          <Ionicons name="close-circle" size={18} color={t.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    height: 36,
    marginHorizontal: t.space.lg,
    marginTop: t.space.md,
    marginBottom: t.space.sm,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface3,
  },
  input: { flex: 1, color: t.colors.text, fontFamily: t.fonts.medium, fontSize: t.size(14) },
}));
