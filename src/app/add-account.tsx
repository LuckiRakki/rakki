import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { LoginForm } from '@/auth/LoginForm';
import { useTheme } from '@/ui/theme';

/** Settings → Add account: sign in to another server or user; it becomes the active account. */
export default function AddAccountScreen() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={{ paddingHorizontal: t.space.lg, paddingTop: t.space.md }}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
      </View>
      <LoginForm adding onDone={() => router.dismissAll()} />
    </View>
  );
}
