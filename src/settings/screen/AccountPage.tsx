// Settings → your profile: the account signed in, switching to another, adding one.
import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';

import { Ionicons } from '@/ui/Icon';
import { removeAccount, switchAccount } from '@/auth/actions';
import { changeProfilePicture } from '@/auth/profile';
import { accountKey, useAuth } from '@/auth/store';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { UserAvatar } from '@/ui/UserAvatar';
import { useSettingsStyles } from '@/settings/screen/styles';

export function AccountPage({ others }: { others: ReturnType<typeof useAuth.getState>['accounts'] }) {
  const t = useTheme();
  const styles = useSettingsStyles();
  const session = useAuth((s) => s.session);
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
        <Pressable onPress={() => void changeProfilePicture()} accessibilityLabel="Change Profile Picture">
          <UserAvatar size={52} />
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={12} color="#000" />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <T variant="bodyStrong">{session?.userName}</T>
          <T variant="caption" style={{ marginTop: 2 }}>
            {session?.serverName} · {session?.serverUrl}
          </T>
        </View>
      </View>

      {others.length ? (
        <View style={{ marginTop: t.space.lg }}>
          <T style={styles.sectionTitle}>Switch To</T>
          {others.map((a) => (
            <Pressable
              key={accountKey(a)}
              onPress={() => {
                void switchAccount(a);
                router.dismissAll();
              }}
              onLongPress={() =>
                Alert.alert(`Remove ${a.userName}?`, `${a.serverName} will no longer be on this iPhone.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => void removeAccount(a) },
                ])
              }
              style={({ pressed }) => [styles.accountRow, pressed && { opacity: 0.7 }]}>
              <View style={styles.initial}>
                <T style={{ fontFamily: t.fonts.bold, color: t.colors.text }}>{a.userName.charAt(0).toUpperCase()}</T>
              </View>
              <View style={{ flex: 1, marginLeft: t.space.md }}>
                <T variant="bodyStrong">{a.userName}</T>
                <T variant="caption" numberOfLines={1} style={{ fontSize: t.size(12) }}>
                  {a.serverName} · {a.serverUrl}
                </T>
              </View>
              <Ionicons name="swap-horizontal" size={20} color={t.colors.textSecondary} />
            </Pressable>
          ))}
          <T variant="caption" style={{ fontSize: t.size(11), marginTop: t.space.xs }}>
            Hold an account to remove it.
          </T>
        </View>
      ) : null}

      <Pressable onPress={() => router.push('/add-account')} style={({ pressed }) => [styles.outlineButton, pressed && { opacity: 0.7 }]}>
        <T variant="bodyStrong">Add Account</T>
      </Pressable>
    </View>
  );
}
