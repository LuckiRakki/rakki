import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { checkLastfmKey, LastfmError } from '@/lib/lastfm';
import { useSettings } from '@/settings/store';
import { Toggle } from '@/ui/SettingRows';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const GET_KEY_URL = 'https://www.last.fm/api/account/create';

/**
 * Settings → Last.fm: the user's own API key, for worldwide play counts on artist and album
 * pages. It's kept on the phone only.
 */
export function LastfmSettings() {
  const t = useTheme();
  const styles = useStyles();
  const saved = useSettings((s) => s.lastfmApiKey);
  const albumPlays = useSettings((s) => s.lastfmAlbumPlays);
  const [key, setKey] = useState(saved);
  const [state, setState] = useState<{ checking: boolean; result: string | null }>({ checking: false, result: null });

  const save = (value: string) => {
    setKey(value);
    setState({ checking: false, result: null });
    useSettings.getState().set('lastfmApiKey', value.trim());
  };

  const check = async () => {
    if (!key.trim()) return;
    setState({ checking: true, result: null });
    try {
      await checkLastfmKey(key);
      setState({ checking: false, result: 'Works. Artist pages now show worldwide plays.' });
    } catch (e) {
      setState({ checking: false, result: e instanceof LastfmError ? e.message : 'That key didn’t work.' });
    }
  };

  return (
    <>
      <T variant="label" style={styles.section}>
        Last.fm
      </T>
      <View style={styles.card}>
        <T variant="bodyStrong">Worldwide play counts</T>
        <T variant="caption" style={{ fontSize: t.size(12), marginTop: 2 }}>
          Plays on Last.fm for artists&apos; popular songs and on album pages. That needs a free
          Last.fm API key: create one, then paste it here. It stays on this phone.
        </T>
        <TextInput
          value={key}
          onChangeText={save}
          placeholder="Paste your API key"
          placeholderTextColor={t.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          keyboardAppearance="dark"
          selectionColor={t.colors.accent}
          style={styles.input}
        />
        {state.result ? (
          <T variant="caption" style={{ fontSize: t.size(12), marginTop: t.space.sm }}>
            {state.result}
          </T>
        ) : null}
        <View style={styles.buttons}>
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(GET_KEY_URL)}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
            <T variant="bodyStrong">Get a free key</T>
          </Pressable>
          <Pressable
            disabled={!key.trim() || state.checking}
            onPress={() => void check()}
            style={({ pressed }) => [styles.button, (!key.trim() || pressed) && { opacity: 0.5 }]}>
            {state.checking ? <ActivityIndicator color={t.colors.text} /> : <T variant="bodyStrong">Check</T>}
          </Pressable>
        </View>
        <Toggle
          label="Plays on albums"
          detail="Last.fm play counts under each song on album pages"
          value={albumPlays}
          onChange={(v) => useSettings.getState().set('lastfmAlbumPlays', v)}
        />
      </View>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  section: { marginTop: t.space.xl, marginBottom: t.space.sm },
  card: { backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.space.lg },
  input: {
    marginTop: t.space.md,
    height: 42,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface3,
    color: t.colors.text,
    fontFamily: t.fonts.medium,
    fontSize: t.size(14),
  },
  buttons: { flexDirection: 'row', gap: t.space.sm, marginTop: t.space.md },
  button: {
    flex: 1,
    height: 40,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
