import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  authenticateByName,
  authenticateWithQuickConnect,
  getPublicInfo,
  normalizeServerUrl,
  quickConnectEnabled,
  quickConnectInitiate,
  quickConnectState,
  type PublicSystemInfo,
  type Session,
} from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

interface Server {
  url: string;
  info: PublicSystemInfo;
  quickConnect: boolean;
}

function message(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

async function finish(
  server: Server,
  deviceId: string,
  r: Pick<Session, 'userId' | 'userName' | 'token'>,
) {
  await useAuth.getState().signIn({
    ...r,
    serverUrl: server.url,
    serverName: server.info.ServerName,
    deviceId,
  });
}

export default function LoginScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const deviceId = useAuth((s) => s.deviceId);
  const lastServer = useAuth((s) => s.lastServer);

  const [serverInput, setServerInput] = useState(lastServer);
  const [server, setServer] = useState<Server | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [quick, setQuick] = useState<{ code: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    if (!serverInput.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const url = normalizeServerUrl(serverInput);
      const info = await getPublicInfo(url, deviceId);
      setServer({ url, info, quickConnect: await quickConnectEnabled(url, deviceId) });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    if (!server || !username.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await finish(
        server,
        deviceId,
        await authenticateByName(server.url, deviceId, username.trim(), password),
      );
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  async function startQuickConnect() {
    if (!server) return;
    setError(null);
    try {
      const r = await quickConnectInitiate(server.url, deviceId);
      setQuick({ code: r.Code, secret: r.Secret });
    } catch (e) {
      setError(message(e));
    }
  }

  // Poll until the code is approved in another Jellyfin client (Settings → Quick Connect).
  useEffect(() => {
    if (!quick || !server) return;
    let done = false;
    const timer = setInterval(async () => {
      if (done) return;
      try {
        const s = await quickConnectState(server.url, deviceId, quick.secret);
        if (s.Authenticated && !done) {
          done = true;
          clearInterval(timer);
          await finish(
            server,
            deviceId,
            await authenticateWithQuickConnect(server.url, deviceId, quick.secret),
          );
        }
      } catch {
        // keep polling; transient network errors are fine here
      }
    }, 2500);
    return () => {
      done = true;
      clearInterval(timer);
    };
  }, [quick, server, deviceId]);

  function changeServer() {
    setServer(null);
    setQuick(null);
    setError(null);
    setPassword('');
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <LinearGradient
        colors={['rgba(255,107,61,0.35)', 'rgba(255,107,61,0.06)', t.colors.bg]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 32 },
          ]}>
          <T style={styles.wordmark}>
            Rakki<T style={[styles.wordmark, { color: t.colors.accent }]}>.</T>
          </T>
          <T variant="caption" style={{ marginBottom: t.space.xxl, fontSize: t.size(15) }}>
            Your Jellyfin music, with Spicy Lyrics.
          </T>

          {!server ? (
            <>
              <T variant="label" style={styles.fieldLabel}>
                Server address
              </T>
              <Field
                value={serverInput}
                onChangeText={setServerInput}
                placeholder="http://192.168.1.10:8096"
                keyboardType="url"
                textContentType="URL"
                returnKeyType="go"
                onSubmitEditing={connect}
                autoFocus={!lastServer}
              />
              <T variant="caption" style={styles.hint}>
                The same address you use in Finamp or the Jellyfin web app. http:// is fine.
              </T>
              <PrimaryButton label="Connect" busy={busy} onPress={connect} />
            </>
          ) : (
            <>
              <Pressable onPress={changeServer} style={styles.serverChip}>
                <Ionicons name="server-outline" size={16} color={t.colors.textSecondary} />
                <View style={{ flex: 1, marginLeft: t.space.sm }}>
                  <T variant="bodyStrong" numberOfLines={1}>
                    {server.info.ServerName}
                  </T>
                  <T variant="caption" numberOfLines={1} style={{ fontSize: t.size(12) }}>
                    {server.url} · Jellyfin {server.info.Version}
                  </T>
                </View>
                <T variant="caption" color={t.colors.accent}>
                  Change
                </T>
              </Pressable>

              {quick ? (
                <View style={styles.quickBox}>
                  <T variant="label">Quick Connect code</T>
                  <T style={styles.quickCode}>{quick.code}</T>
                  <T variant="caption" style={{ textAlign: 'center' }}>
                    In another Jellyfin app that’s signed in, open Settings → Quick Connect and
                    enter this code.
                  </T>
                  <ActivityIndicator color={t.colors.accent} style={{ marginTop: t.space.lg }} />
                  <Pressable onPress={() => setQuick(null)} style={{ marginTop: t.space.lg }}>
                    <T variant="caption" color={t.colors.text}>
                      Use password instead
                    </T>
                  </Pressable>
                </View>
              ) : (
                <>
                  <T variant="label" style={styles.fieldLabel}>
                    Username
                  </T>
                  <Field
                    value={username}
                    onChangeText={setUsername}
                    textContentType="username"
                    autoComplete="username"
                    returnKeyType="next"
                    autoFocus
                  />
                  <T variant="label" style={styles.fieldLabel}>
                    Password
                  </T>
                  <Field
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    textContentType="password"
                    autoComplete="current-password"
                    returnKeyType="go"
                    onSubmitEditing={signIn}
                  />
                  <PrimaryButton label="Sign in" busy={busy} onPress={signIn} />
                  {server.quickConnect ? (
                    <Pressable
                      onPress={startQuickConnect}
                      style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}>
                      <T variant="bodyStrong">Use Quick Connect</T>
                    </Pressable>
                  ) : null}
                </>
              )}
            </>
          )}

          {error ? (
            <View style={styles.error}>
              <Ionicons name="alert-circle" size={18} color={t.colors.danger} />
              <T variant="caption" color={t.colors.text} style={{ flex: 1, marginLeft: t.space.sm }}>
                {error}
              </T>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field(props: TextInputProps) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={t.colors.textMuted}
      selectionColor={t.colors.accent}
      {...props}
      style={styles.input}
    />
  );
}

function PrimaryButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, (pressed || busy) && { opacity: 0.8 }]}>
      {busy ? (
        <ActivityIndicator color="#000" />
      ) : (
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16), color: '#000' }}>{label}</T>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.space.xl, flexGrow: 1 },
  wordmark: { fontFamily: t.fonts.black, fontSize: t.size(52), letterSpacing: -2, color: t.colors.text },
  fieldLabel: { marginBottom: t.space.sm, marginTop: t.space.lg },
  hint: { marginTop: t.space.sm, fontSize: t.size(12) },
  input: {
    height: 50,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface2,
    paddingHorizontal: t.space.lg,
    color: t.colors.text,
    fontFamily: t.fonts.medium,
    fontSize: t.size(16),
  },
  primary: {
    height: 50,
    marginTop: t.space.xl,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    height: 50,
    marginTop: t.space.md,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: t.space.md,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface2,
  },
  quickBox: {
    marginTop: t.space.xl,
    padding: t.space.xl,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
  },
  quickCode: {
    fontFamily: t.fonts.black,
    fontSize: t.size(44),
    letterSpacing: 8,
    color: t.colors.text,
    marginVertical: t.space.md,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: t.space.xl,
    padding: t.space.md,
    borderRadius: t.radius.card,
    backgroundColor: 'rgba(255,84,112,0.12)',
  },
}));
