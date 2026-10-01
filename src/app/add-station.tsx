import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlayer } from '@/player/store';
import { resolveStation, useStations } from '@/radio/stations';
import { showToast } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** Add a radio station by its address (a SUB/WAVE station, a stream URL or a .pls/.m3u link). */
export default function AddStationScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!address.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const found = await resolveStation(address);
      const station = useStations.getState().add(found);
      showToast(found.apiBase ? `Added ${station.name} (SUB/WAVE)` : `Added ${station.name}`);
      router.back();
      usePlayer.getState().playStation(station);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add that station.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top + t.space.sm, paddingHorizontal: t.space.lg }}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Add a station</T>
        <View style={{ width: 28 }} />
      </View>
      <T variant="caption" style={{ marginTop: t.space.lg, fontSize: t.size(13) }}>
        Paste the station&apos;s address. For a SUB/WAVE station that&apos;s its web address; Rakki
        finds the stream, the name and what&apos;s on air. Any other internet radio works with its
        stream URL or a .pls / .m3u link.
      </T>
      <TextInput
        value={address}
        onChangeText={(v) => {
          setAddress(v);
          setError(null);
        }}
        onSubmitEditing={() => void add()}
        placeholder="https://radio.example.com"
        placeholderTextColor={t.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        keyboardAppearance="dark"
        selectionColor={t.colors.accent}
        autoFocus
        style={styles.input}
      />
      {error ? (
        <T variant="caption" color={t.colors.danger} style={{ marginTop: t.space.sm }}>
          {error}
        </T>
      ) : null}
      <Pressable
        disabled={!address.trim() || busy}
        onPress={() => void add()}
        style={({ pressed }) => [styles.add, (!address.trim() || pressed) && { opacity: 0.6 }]}>
        {busy ? <ActivityIndicator color="#000" /> : <T style={{ fontFamily: t.fonts.bold, color: '#000' }}>Add and play</T>}
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
  input: {
    marginTop: t.space.lg,
    height: 48,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface2,
    color: t.colors.text,
    fontFamily: t.fonts.medium,
    fontSize: t.size(15),
  },
  add: {
    marginTop: t.space.lg,
    height: 48,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
